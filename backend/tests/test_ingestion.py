"""
tests/test_ingestion.py
───────────────────────
Verifies the s3_streamer ingestion pipeline:

 ✓ DB file is created on disk by engine + create_all
 ✓ run_ingestion() executes without raising exceptions
 ✓ The correct number of Case rows is inserted (one per mock judgment)
 ✓ All inserted rows have status=PENDING
 ✓ case_citation and court_name fields are non-empty
 ✓ raw_text fields are non-empty (text was loaded)
 ✓ parsed_text is NULL (not yet processed)
 ✓ No Event or TemporalRelation rows exist (populated in Phase 2)
 ✓ Re-running ingestion does NOT create duplicate rows (idempotency)
 ✓ Text cleaning removes boilerplate (page footers, separator lines)

Architecture note — why _raw_counts() uses sqlite3 directly
────────────────────────────────────────────────────────────
SQLAlchemy's compiled-statement cache is process-global, keyed only on the
SQL string.  When test_ingestion_runs_without_exception runs first on an
empty DB, the ORM SELECT for a case_citation caches "0 rows".  The next
test (count_test.db, now populated) gets the same cached "0 rows" answer.

Using stdlib sqlite3 for verification queries bypasses SQLAlchemy entirely
and always reads the true committed state from the DB file.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.base import Base  # noqa: E402
from db import models as _models  # noqa: F401, E402
from db.models import Case, CaseStatus, Event, TemporalRelation  # noqa: E402
from ingestion.s3_streamer import clean_text, MOCK_DATA_PATH  # noqa: E402


# ── Constants ─────────────────────────────────────────────────────────────────

EXPECTED_CASE_COUNT = 5  # number of entries in judgments.json


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_test_engine(db_path: Path):
    """
    Build a fresh SQLite engine + tables.
    NullPool + query_cache_size=0 prevent any connection or statement reuse.
    """
    eng = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
        query_cache_size=0,
        echo=False,
    )

    @sa_event.listens_for(eng, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(bind=eng)
    return eng


def _run_ingestion_on(db_path: Path) -> int:
    """
    Create a fresh test engine on db_path, patch the SessionLocal name
    **inside ingestion.s3_streamer** (where it was imported as a local
    binding via 'from db.base import SessionLocal'), run ingestion, then
    restore everything.

    Patching db.base.SessionLocal is NOT sufficient because Python's
    'from X import Y' creates an independent local reference in the
    importing module.  We must patch the name where it is actually used.

    Returns the inserted-row count reported by run_ingestion().
    """
    import ingestion.s3_streamer as streamer
    from sqlalchemy.pool import NullPool

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
        query_cache_size=0,
        echo=False,
    )

    @sa_event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(bind=engine)

    PatchedSession = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )

    # Patch the name exactly where the streamer uses it.
    original_sl = streamer.SessionLocal
    streamer.SessionLocal = PatchedSession
    try:
        inserted = streamer.run_ingestion()
    finally:
        streamer.SessionLocal = original_sl
        engine.dispose()
    return inserted


def _raw_counts(db_path: Path) -> dict:
    """
    Open a brand-new stdlib sqlite3 connection (zero SQLAlchemy involvement)
    and return counts + row data.  Immune to ORM compiled-statement cache.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        total_cases   = cur.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
        non_pending   = cur.execute(
            "SELECT COUNT(*) FROM cases WHERE status != 'PENDING'"
        ).fetchone()[0]
        event_count   = cur.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        relation_count = cur.execute(
            "SELECT COUNT(*) FROM temporal_relations"
        ).fetchone()[0]
        case_rows     = cur.execute(
            "SELECT case_citation, court_name, raw_text, parsed_text FROM cases"
        ).fetchall()
    finally:
        conn.close()
    return dict(
        total_cases=total_cases,
        non_pending=non_pending,
        event_count=event_count,
        relation_count=relation_count,
        case_rows=case_rows,   # list of (citation, court, raw_text, parsed_text)
    )


# ── DB-file creation ──────────────────────────────────────────────────────────


class TestDatabaseFileCreation:
    def test_db_file_created_by_engine(self, tmp_path):
        """SQLite DB file must exist after engine + create_all."""
        db_path = tmp_path / "created.db"
        assert not db_path.exists()
        eng = _make_test_engine(db_path)
        eng.dispose()
        assert db_path.exists(), "DB file was not created."


# ── Mock data file ────────────────────────────────────────────────────────────


class TestMockDataFile:
    def test_mock_data_file_exists(self):
        assert MOCK_DATA_PATH.exists(), f"Mock data not found: {MOCK_DATA_PATH}"

    def test_mock_data_is_valid_json(self):
        with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        assert isinstance(data, list), "Mock data must be a JSON array."

    def test_mock_data_has_expected_count(self):
        with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        assert len(data) == EXPECTED_CASE_COUNT, (
            f"Expected {EXPECTED_CASE_COUNT} judgments, found {len(data)}."
        )

    def test_mock_entries_have_required_keys(self):
        required = {"case_citation", "court_name", "text"}
        with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        for i, entry in enumerate(data):
            missing = required - set(entry.keys())
            assert not missing, f"Entry {i} missing keys: {missing}"

    def test_mock_texts_contain_explicit_dates(self):
        """Each judgment must contain at least one 4-digit year."""
        import re
        year_pattern = re.compile(r"\b(20\d{2}|19\d{2})\b")
        with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        for entry in data:
            assert year_pattern.search(entry["text"]), (
                f"No year found in judgment {entry['case_citation']!r}"
            )

    def test_mock_texts_contain_temporal_markers(self):
        """At least one judgment must contain a relative temporal marker."""
        markers = ["following", "prior to", "subsequently", "thereafter",
                   "days after", "weeks after"]
        with MOCK_DATA_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        found = any(
            any(m in entry["text"].lower() for m in markers)
            for entry in data
        )
        assert found, "No relative temporal markers found in mock data."


# ── Text cleaning ─────────────────────────────────────────────────────────────


class TestTextCleaning:
    def test_page_footer_removed(self):
        raw = "Some text.\nPage 1 of 3 | High Court | Official Copy\nMore text."
        cleaned = clean_text(raw)
        assert "Page 1 of 3" not in cleaned

    def test_separator_lines_removed(self):
        raw = "Header\n────────────────────────────\nBody text."
        cleaned = clean_text(raw)
        assert "────" not in cleaned

    def test_index_markers_removed(self):
        raw = "Judgment text.\nIndex: Yes\nInternet: Yes\nPd"
        cleaned = clean_text(raw)
        assert "Index: Yes" not in cleaned
        assert "Internet: Yes" not in cleaned

    def test_excess_blank_lines_collapsed(self):
        raw = "Line one.\n\n\n\n\nLine two."
        cleaned = clean_text(raw)
        assert "\n\n\n" not in cleaned

    def test_substantive_content_preserved(self):
        raw = "The accused was arrested on 14th August 2023 by the investigating officer."
        cleaned = clean_text(raw)
        assert "arrested" in cleaned
        assert "14th August 2023" in cleaned


# ── Ingestion execution ───────────────────────────────────────────────────────


class TestIngestionExecution:
    def test_ingestion_runs_without_exception(self, tmp_path):
        """run_ingestion() must complete without raising."""
        db_path = tmp_path / "ingest_ok.db"
        inserted = _run_ingestion_on(db_path)
        assert isinstance(inserted, int)

    def test_ingestion_inserts_expected_row_count(self, tmp_path):
        """Exactly 5 Case rows must exist after ingestion."""
        db_path = tmp_path / "count_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        assert counts["total_cases"] == EXPECTED_CASE_COUNT, (
            f"Expected {EXPECTED_CASE_COUNT} cases, found {counts['total_cases']}."
        )

    def test_all_inserted_cases_are_pending(self, tmp_path):
        """Every inserted Case must have status=PENDING."""
        db_path = tmp_path / "status_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        assert counts["non_pending"] == 0, (
            f"{counts['non_pending']} case(s) have non-PENDING status."
        )

    def test_inserted_cases_have_non_empty_citation(self, tmp_path):
        """case_citation and court_name must be non-empty strings."""
        db_path = tmp_path / "citation_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        for citation, court, _raw, _parsed in counts["case_rows"]:
            assert citation, "Empty case_citation found"
            assert court, f"Empty court_name for citation={citation!r}"

    def test_inserted_cases_have_raw_text(self, tmp_path):
        """raw_text must be populated for every Case."""
        db_path = tmp_path / "raw_text_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        for citation, _court, raw_text, _parsed in counts["case_rows"]:
            assert raw_text, f"Empty raw_text for case citation={citation!r}"

    def test_inserted_cases_have_null_parsed_text(self, tmp_path):
        """parsed_text must be NULL at ingestion time (populated in Phase 2)."""
        db_path = tmp_path / "parsed_text_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        for citation, _court, _raw, parsed_text in counts["case_rows"]:
            assert parsed_text is None, (
                f"parsed_text is not NULL for case {citation!r}"
            )

    def test_no_events_inserted(self, tmp_path):
        """No Event rows should exist after ingestion (Phase 2 work)."""
        db_path = tmp_path / "events_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        assert counts["event_count"] == 0, (
            f"Expected 0 events, found {counts['event_count']}."
        )

    def test_no_temporal_relations_inserted(self, tmp_path):
        """No TemporalRelation rows should exist after ingestion."""
        db_path = tmp_path / "relations_test.db"
        _run_ingestion_on(db_path)
        counts = _raw_counts(db_path)
        assert counts["relation_count"] == 0, (
            f"Expected 0 temporal_relations, found {counts['relation_count']}."
        )

    def test_ingestion_is_idempotent(self, tmp_path):
        """Running ingestion twice must not create duplicate rows."""
        db_path = tmp_path / "idempotent_test.db"
        _run_ingestion_on(db_path)   # First pass — inserts 5
        _run_ingestion_on(db_path)   # Second pass — should skip all 5
        counts = _raw_counts(db_path)
        assert counts["total_cases"] == EXPECTED_CASE_COUNT, (
            f"After two ingestion runs, expected {EXPECTED_CASE_COUNT} rows, "
            f"found {counts['total_cases']} (possible duplicate insertion)."
        )
