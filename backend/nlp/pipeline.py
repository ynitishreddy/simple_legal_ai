"""
nlp/pipeline.py
───────────────
Batch NLP processing pipeline.

Reads all Cases with status=PENDING from the DB, runs EventExtractor on
each case's raw_text, writes the resulting Event rows, marks the case
status=NLP_COMPLETE, and updates parsed_text with a cleaned version of
the raw text.

Usage (standalone):
    python -m nlp.pipeline
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.base import SessionLocal
from db.models import Case, CaseStatus, Event
from nlp.extractor import EventExtractor

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def run_nlp_pipeline(session_factory=None) -> dict:
    """
    Process all PENDING cases and persist extracted events.

    Parameters
    ----------
    session_factory : callable, optional
        A SQLAlchemy session factory.  Defaults to the production SessionLocal.
        Pass a test factory in unit tests.

    Returns
    -------
    dict with keys:
        cases_processed : int
        events_inserted : int
        cases_failed    : list[str]  — case_citations that raised an exception
    """
    factory = session_factory or SessionLocal
    extractor = EventExtractor()

    cases_processed = 0
    events_inserted = 0
    cases_failed: list[str] = []

    with factory() as db:
        pending = db.query(Case).filter(Case.status == CaseStatus.PENDING).all()
        logger.info("NLP pipeline: %d PENDING case(s) to process.", len(pending))

        for case in pending:
            try:
                # Update status to PROCESSING
                case.status = CaseStatus.PROCESSING
                case.progress_step = "NLP_START"
                case.status_message = "Initializing NLP engine..."
                db.commit()

                # Start extraction
                case.progress_step = "EXTRACTING_ENTITIES"
                case.status_message = "Extracting temporal anchors and event triggers..."
                db.commit()

                raw_events = extractor.extract(case.raw_text or "")

                # Persist each extracted event
                for ev in raw_events:
                    db_event = Event(
                        case_id=case.id,
                        trigger_word=ev.trigger_word[:255],
                        event_description=ev.event_description[:2000],
                        sentence_text=ev.sentence_text[:2000],
                        absolute_date_raw=ev.absolute_date_raw,
                        absolute_date_iso=ev.absolute_date_iso,
                        relative_marker=(ev.relative_marker or "")[:500],
                        sentence_index=ev.sentence_index,
                        confidence=ev.confidence,
                        category=ev.category[:50] if ev.category else None,
                        actor=ev.actor[:255] if ev.actor else None,
                        anchor_event_ref=ev.anchor_event_ref[:500] if ev.anchor_event_ref else None,
                    )
                    db.add(db_event)
                    events_inserted += 1

                # Update case status and store cleaned text
                case.parsed_text = "\n".join(
                    e.event_description for e in raw_events
                ) or case.raw_text

                # Flush so that events exist in the database with their generated IDs
                db.flush()

                # Build the temporal event graph
                case.progress_step = "BUILDING_TIMELINE"
                case.status_message = "Resolving temporal relationships and building timeline..."
                db.commit()

                from graph.builder import GraphBuilder
                builder = GraphBuilder()
                builder.build_case_graph(case.id, db)

                case.status = CaseStatus.COMPLETED
                case.progress_step = "SUCCESS"
                case.status_message = "Case analysis and graph construction complete."
                db.commit()

                cases_processed += 1
                logger.info(
                    "  [OK] %s — %d event(s) extracted & graph built.",
                    case.case_citation,
                    len(raw_events),
                )

            except Exception as exc:
                logger.error(
                    "  [FAIL] %s — %s", case.case_citation, exc, exc_info=True
                )
                case.status = CaseStatus.FAILED
                case.progress_step = "FAILED"
                case.status_message = f"Error: {str(exc)}"
                db.commit()
                cases_failed.append(case.case_citation)

        db.commit()

    logger.info(
        "NLP pipeline done. cases_processed=%d events_inserted=%d failed=%d",
        cases_processed,
        events_inserted,
        len(cases_failed),
    )
    return dict(
        cases_processed=cases_processed,
        events_inserted=events_inserted,
        cases_failed=cases_failed,
    )


if __name__ == "__main__":
    result = run_nlp_pipeline()
    print(f"\n[OK] NLP pipeline complete.")
    print(f"     Cases processed : {result['cases_processed']}")
    print(f"     Events inserted : {result['events_inserted']}")
    if result["cases_failed"]:
        print(f"     Failed cases    : {result['cases_failed']}")
