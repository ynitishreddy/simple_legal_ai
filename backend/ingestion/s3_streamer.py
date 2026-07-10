"""
ingestion/s3_streamer.py
────────────────────────
Streams Indian High Court judgment documents from S3 and ingests them
into the ``cases`` table with status ``PENDING``.

Execution Modes
───────────────
1. **S3 Mode** (production):
   Requires valid AWS credentials in the environment.
   Iterates over all objects under ``s3://<S3_BUCKET>/<S3_PREFIX>``.

2. **Local Fallback Mode** (development / CI):
   Activated automatically when boto3 raises ``NoCredentialsError``,
   ``EndpointConnectionError``, or any other connection-level exception.
   Falls back to ``ingestion/mock_data/judgments.json``.

Text Cleaning
─────────────
The following legal boilerplate patterns are stripped before storage:
  • High Court title blocks (first 4 lines of header)
  • "Page N of N | ..." footer lines
  • Dashed separator lines (────)
  • "INDEX", "INTERNET", "Pd" audit markers
  • Excess blank lines (3+ consecutive → 1)

Usage
─────
  # As a module:
  from ingestion.s3_streamer import run_ingestion
  run_ingestion()

  # As a script:
  python -m ingestion.s3_streamer
"""

from __future__ import annotations

import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

import boto3
import botocore.exceptions
from sqlalchemy.orm import Session

# ── Adjust sys.path so the module resolves correctly when run as a script ─────
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from config import settings  # noqa: E402
from db.base import SessionLocal  # noqa: E402
from db.models import Case, CaseStatus  # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────────

MOCK_DATA_PATH = Path(__file__).parent / "mock_data" / "judgments.json"

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Text Cleaning ─────────────────────────────────────────────────────────────

# Patterns to strip from raw judgment text.
_NOISE_PATTERNS: list[re.Pattern] = [
    # Dashed separator lines  ──────────────────────────
    re.compile(r"^[-─━═]{4,}.*$", re.MULTILINE),
    # Court page footers: "Page N of N | ..."
    re.compile(r"^Page\s+\d+\s+of\s+\d+.*$", re.MULTILINE | re.IGNORECASE),
    # Audit trail markers
    re.compile(r"^\s*(Index\s*:\s*\w+|Internet\s*:\s*\w+|Pd)\s*$", re.MULTILINE | re.IGNORECASE),
    # Registry / certified copy trailing lines
    re.compile(r"^\s*(Certified\s+(True\s+)?Copy|Official\s+Copy|Registry\s+(Seal|Copy)|Nominal\s+Roll\s+No\..*)\s*$",
               re.MULTILINE | re.IGNORECASE),
    # Windows-style \r characters
    re.compile(r"\r"),
]


def clean_text(raw: str) -> str:
    """
    Strip legal boilerplate from a raw judgment string.

    Steps
    -----
    1. Remove header block (first 4 lines: court title, case number, etc.)
    2. Apply all regex noise patterns.
    3. Collapse three or more consecutive blank lines into one.
    4. Strip leading/trailing whitespace.
    """
    lines = raw.splitlines()

    # 1. Remove common high-court header block (first up to 4 lines that
    #    start with "IN THE" or are purely caps/whitespace).
    start_idx = 0
    for i, line in enumerate(lines[:4]):
        stripped = line.strip()
        if stripped.upper() == stripped and stripped.startswith("IN THE"):
            start_idx = i + 1
            break
    text = "\n".join(lines[start_idx:])

    # 2. Noise pattern substitution.
    for pattern in _NOISE_PATTERNS:
        text = pattern.sub("", text)

    # 3. Collapse excess blank lines.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ── S3 Loading ────────────────────────────────────────────────────────────────


def _load_from_s3() -> list[dict[str, Any]]:
    """
    Stream judgment objects from S3.

    Returns a list of dicts with keys:
      ``s3_key``, ``case_citation``, ``court_name``, ``text``
    """
    s3 = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )

    log.info(
        "Listing objects in s3://%s/%s …",
        settings.s3_bucket,
        settings.s3_prefix,
    )

    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=settings.s3_bucket, Prefix=settings.s3_prefix)

    documents: list[dict[str, Any]] = []

    for page in pages:
        for obj in page.get("Contents", []):
            key: str = obj["Key"]
            if not key.endswith(".txt") and not key.endswith(".json"):
                continue

            log.info("Fetching s3://%s/%s", settings.s3_bucket, key)
            response = s3.get_object(Bucket=settings.s3_bucket, Key=key)
            body = response["Body"].read().decode("utf-8")

            # Objects are either raw text or JSON with metadata.
            if key.endswith(".json"):
                data = json.loads(body)
                documents.extend(data if isinstance(data, list) else [data])
            else:
                # Plain .txt: derive citation from key path.
                citation = Path(key).stem.replace("_", " ").title()
                documents.append(
                    {
                        "s3_key": key,
                        "case_citation": citation,
                        "court_name": "Unknown Court",
                        "text": body,
                    }
                )

    return documents


def _load_from_local_fallback() -> list[dict[str, Any]]:
    """Load mock judgment data from the local JSON file."""
    log.info("Loading local fallback data from %s", MOCK_DATA_PATH)
    with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


# ── Database Ingestion ────────────────────────────────────────────────────────


def _upsert_cases(documents: list[dict[str, Any]], db: Session) -> int:
    """
    Insert each document as a ``Case`` row if it doesn't already exist.

    Deduplication is performed on ``case_citation``.

    Returns the number of new rows inserted.
    """
    inserted = 0

    for doc in documents:
        citation: str = doc.get("case_citation", "UNKNOWN").strip()
        court: str = doc.get("court_name", "Unknown Court").strip()
        raw: str = doc.get("text", "")

        # Skip duplicates.
        existing = db.query(Case).filter_by(case_citation=citation).first()
        if existing:
            log.info("Skipping duplicate case_citation=%r", citation)
            continue

        case = Case(
            case_citation=citation,
            court_name=court,
            raw_text=raw,
            parsed_text=None,
            status=CaseStatus.PENDING,
        )
        db.add(case)
        db.flush()  # Obtain the auto-generated UUID without committing.
        log.info(
            "Staged Case id=%s citation=%r court=%r",
            case.id,
            citation,
            court,
        )
        inserted += 1

    db.commit()
    return inserted


# ── Public API ────────────────────────────────────────────────────────────────


def run_ingestion() -> int:
    """
    Main entry point.

    1. Attempts to load documents from S3.
    2. Falls back to local mock data on any connection / credential error.
    3. Inserts new cases into the database.

    Returns the number of newly inserted Case rows.
    """
    # 1. Try S3 first.
    documents: list[dict[str, Any]] = []
    try:
        documents = _load_from_s3()
        log.info("Loaded %d document(s) from S3.", len(documents))
    except botocore.exceptions.NoCredentialsError:
        log.warning("No AWS credentials found – switching to local fallback.")
        documents = _load_from_local_fallback()
    except botocore.exceptions.EndpointConnectionError as exc:
        log.warning("Cannot reach AWS endpoint (%s) – switching to local fallback.", exc)
        documents = _load_from_local_fallback()
    except Exception as exc:  # pylint: disable=broad-except
        log.warning(
            "Unexpected S3 error (%s: %s) – switching to local fallback.",
            type(exc).__name__,
            exc,
        )
        documents = _load_from_local_fallback()

    if not documents:
        log.warning("No documents to ingest. Exiting.")
        return 0

    # 2. Clean text before storage.
    for doc in documents:
        doc["text"] = clean_text(doc.get("text", ""))

    # 3. Persist.
    db: Session = SessionLocal()
    try:
        count = _upsert_cases(documents, db)
        log.info("Ingestion complete. Inserted %d new case(s).", count)
        return count
    except Exception:
        db.rollback()
        log.exception("Ingestion failed – transaction rolled back.")
        raise
    finally:
        db.close()


# ── Script Entry Point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    total = run_ingestion()
    print(f"\n[OK] Ingestion finished. {total} new case(s) inserted.")
