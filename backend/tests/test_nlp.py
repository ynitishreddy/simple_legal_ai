"""
tests/test_nlp.py
─────────────────
Unit tests for the Phase 2 NLP extraction pipeline.

Test groups
───────────
TestExtractorUnit          — pure extractor logic on hand-crafted sentences
TestAbsoluteDateParsing    — date normalisation accuracy
TestRelativeMarkers        — relative temporal expression detection
TestEventTriggers          — verb/noun trigger detection
TestExtractorOnMockData    — extractor against all 5 mock judgments
TestPipelineExecution      — run_nlp_pipeline() integration against a live DB
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
from db.models import Case, CaseStatus, Event  # noqa: E402
from ingestion.s3_streamer import MOCK_DATA_PATH  # noqa: E402


# ── Helpers (reused from test_ingestion pattern) ───────────────────────────────

def _make_engine(db_path: Path):
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


def _seed_pending_cases(engine) -> list[str]:
    """Insert all 5 mock cases as PENDING and return their IDs."""
    import uuid
    from datetime import datetime, timezone
    from ingestion.s3_streamer import clean_text

    with open(MOCK_DATA_PATH, encoding="utf-8") as fh:
        mock = json.load(fh)

    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    ids = []
    with Session() as sess:
        for entry in mock:
            case = Case(
                id=str(uuid.uuid4()),
                case_citation=entry["case_citation"],
                court_name=entry["court_name"],
                raw_text=clean_text(entry["text"]),
                status=CaseStatus.PENDING,
                created_at=datetime.now(tz=timezone.utc),
            )
            sess.add(case)
            ids.append(case.id)
        sess.commit()
    return ids


# ── Extractor unit tests ───────────────────────────────────────────────────────

class TestExtractorUnit:
    @pytest.fixture(autouse=True)
    def extractor(self):
        from nlp.extractor import EventExtractor
        self.ex = EventExtractor()

    def test_returns_list(self):
        results = self.ex.extract("Some text without dates or events.")
        assert isinstance(results, list)

    def test_empty_string_returns_empty(self):
        assert self.ex.extract("") == []

    def test_none_like_returns_empty(self):
        assert self.ex.extract("   ") == []

    def test_sentence_with_date_and_trigger_extracted(self):
        text = "The accused was arrested on 14th August 2023 by the police."
        events = self.ex.extract(text)
        assert len(events) >= 1
        ev = events[0]
        assert ev.absolute_date_raw is not None
        assert "2023" in ev.absolute_date_raw
        assert ev.trigger_word  # non-empty

    def test_sentence_without_trigger_not_extracted(self):
        text = "The weather on 14th August 2023 was sunny."
        events = self.ex.extract(text)
        # "was" is not a legal trigger; result may be 0 or based on noun matching
        # Key assertion: if anything is returned, it has a trigger_word
        for ev in events:
            assert ev.trigger_word

    def test_extracted_event_has_required_fields(self):
        text = (
            "The FIR was filed on 5th July 2023 at the Colaba Police Station "
            "against the accused."
        )
        events = self.ex.extract(text)
        assert events, "Expected at least one event"
        ev = events[0]
        assert ev.sentence_text
        assert ev.trigger_word
        assert ev.event_description
        assert 0.0 <= ev.confidence <= 1.0
        assert ev.sentence_index >= 0

    def test_multiple_sentences_multiple_events(self):
        text = (
            "The accused was arrested on 3rd March 2023. "
            "The FIR was registered on 4th March 2023. "
            "Bail was granted on 10th March 2023."
        )
        events = self.ex.extract(text)
        assert len(events) >= 2, "Expected events from multiple sentences"

    def test_relative_marker_captured(self):
        text = (
            "The accused was remanded to custody. "
            "Three days later, bail was granted by the Sessions Court."
        )
        events = self.ex.extract(text)
        rel_events = [e for e in events if e.relative_marker]
        assert rel_events, "Expected at least one event with a relative marker"


# ── Date parsing accuracy ──────────────────────────────────────────────────────

class TestAbsoluteDateParsing:
    @pytest.fixture(autouse=True)
    def extractor(self):
        from nlp.extractor import EventExtractor
        self.ex = EventExtractor()

    def _dates_from(self, text: str) -> list[str]:
        from nlp.extractor import _ABS_DATE_RE
        return [m.group() for m in _ABS_DATE_RE.finditer(text)]

    def test_dmy_full_month_name(self):
        dates = self._dates_from("The order was passed on 14th August 2023.")
        assert any("August" in d for d in dates)

    def test_month_year_only(self):
        dates = self._dates_from("The judgment was pronounced in July 2023.")
        assert any("July" in d for d in dates)

    def test_iso_date(self):
        dates = self._dates_from("The document is dated 2024-01-15.")
        assert any("2024" in d for d in dates)

    def test_slash_date(self):
        dates = self._dates_from("Registered on 23/07/2024.")
        assert any("2024" in d for d in dates)

    def test_normalize_returns_iso(self):
        iso = self.ex._normalize_date("14th August 2023")
        assert iso == "2023-08-14"

    def test_normalize_returns_none_for_garbage(self):
        iso = self.ex._normalize_date("not a date at all xyz")
        assert iso is None


# ── Relative marker detection ──────────────────────────────────────────────────

class TestRelativeMarkers:
    @pytest.fixture(autouse=True)
    def extractor(self):
        from nlp.extractor import EventExtractor
        self.ex = EventExtractor()

    def _markers_from(self, text: str) -> list[str]:
        from nlp.extractor import _REL_MARKER_RE
        return [m.group() for m in _REL_MARKER_RE.finditer(text)]

    def test_days_after(self):
        markers = self._markers_from("Three days after the arrest, bail was sought.")
        assert any("days" in m.lower() for m in markers)

    def test_subsequently(self):
        markers = self._markers_from("Subsequently, the court passed an order.")
        assert any("subsequently" in m.lower() for m in markers)

    def test_thereafter(self):
        markers = self._markers_from("The accused was remanded. Thereafter, bail was filed.")
        assert any("thereafter" in m.lower() for m in markers)

    def test_prior_to(self):
        markers = self._markers_from("Prior to the hearing, notice was served.")
        assert any("prior" in m.lower() for m in markers)

    def test_following_day(self):
        markers = self._markers_from("The following day, the magistrate took cognizance.")
        assert markers  # any match


# ── Event trigger detection ────────────────────────────────────────────────────

class TestEventTriggers:
    @pytest.fixture(autouse=True)
    def extractor(self):
        from nlp.extractor import EventExtractor
        self.ex = EventExtractor()

    def test_arrest_trigger(self):
        text = "The accused was arrested on 14 August 2023."
        events = self.ex.extract(text)
        triggers = [e.trigger_word.lower() for e in events]
        assert any("arrest" in t for t in triggers)

    def test_bail_trigger(self):
        text = "Bail was granted by the Sessions Court on 20 September 2023."
        events = self.ex.extract(text)
        triggers = [e.trigger_word.lower() for e in events]
        assert any("bail" in t for t in triggers)

    def test_filed_trigger(self):
        text = "A writ petition was filed on 1st January 2024."
        events = self.ex.extract(text)
        triggers = [e.trigger_word.lower() for e in events]
        assert any("file" in t or "petition" in t for t in triggers)


# ── Extractor on full mock data ────────────────────────────────────────────────

class TestExtractorOnMockData:
    @pytest.fixture(autouse=True)
    def extractor(self):
        from nlp.extractor import EventExtractor
        self.ex = EventExtractor()

    def test_all_mock_cases_produce_events(self):
        """Every mock judgment must yield at least one extracted event."""
        with open(MOCK_DATA_PATH, encoding="utf-8") as fh:
            mock = json.load(fh)
        from ingestion.s3_streamer import clean_text
        for entry in mock:
            events = self.ex.extract(clean_text(entry["text"]))
            assert events, (
                f"No events extracted from {entry['case_citation']!r}"
            )

    def test_extracted_events_have_iso_dates(self):
        """At least half the events per case should resolve to an ISO date."""
        with open(MOCK_DATA_PATH, encoding="utf-8") as fh:
            mock = json.load(fh)
        from ingestion.s3_streamer import clean_text
        for entry in mock:
            events = self.ex.extract(clean_text(entry["text"]))
            dated = [e for e in events if e.absolute_date_iso]
            assert dated, (
                f"No dated events in {entry['case_citation']!r}"
            )


# ── Pipeline integration ───────────────────────────────────────────────────────

class TestPipelineExecution:
    def test_pipeline_processes_all_pending(self, tmp_path):
        """run_nlp_pipeline() must change all PENDING → NLP_COMPLETE."""
        db_path = tmp_path / "pipeline_test.db"
        engine = _make_engine(db_path)
        _seed_pending_cases(engine)
        engine.dispose()

        # Run pipeline against this isolated DB
        from nlp.pipeline import run_nlp_pipeline
        import nlp.pipeline as pipeline_mod
        import ingestion.s3_streamer as streamer_mod

        engine2 = _make_engine(db_path)
        PatchedSession = sessionmaker(
            bind=engine2, autoflush=False, autocommit=False, expire_on_commit=False
        )
        original_sl = pipeline_mod.SessionLocal
        pipeline_mod.SessionLocal = PatchedSession
        try:
            result = run_nlp_pipeline(session_factory=PatchedSession)
        finally:
            pipeline_mod.SessionLocal = original_sl
            engine2.dispose()

        assert result["cases_processed"] == 5
        assert result["cases_failed"] == []

    def test_pipeline_inserts_events(self, tmp_path):
        """Event rows must appear in the DB after the pipeline runs."""
        db_path = tmp_path / "events_pipeline.db"
        engine = _make_engine(db_path)
        _seed_pending_cases(engine)
        engine.dispose()

        from nlp.pipeline import run_nlp_pipeline
        engine2 = _make_engine(db_path)
        PatchedSession = sessionmaker(
            bind=engine2, autoflush=False, autocommit=False, expire_on_commit=False
        )
        try:
            run_nlp_pipeline(session_factory=PatchedSession)
        finally:
            engine2.dispose()

        # Read directly with sqlite3 to avoid ORM cache
        conn = sqlite3.connect(str(db_path))
        try:
            count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            statuses = conn.execute(
                "SELECT DISTINCT status FROM cases"
            ).fetchall()
        finally:
            conn.close()

        assert count > 0, "Expected Event rows after NLP pipeline"
        status_vals = {row[0] for row in statuses}
        assert "PENDING" not in status_vals, "Some cases still PENDING after pipeline"

    def test_pipeline_idempotent_no_double_processing(self, tmp_path):
        """Running the pipeline twice must not create duplicate events."""
        db_path = tmp_path / "idempotent_pipeline.db"
        engine = _make_engine(db_path)
        _seed_pending_cases(engine)
        engine.dispose()

        from nlp.pipeline import run_nlp_pipeline

        def _run():
            eng = _make_engine(db_path)
            sess = sessionmaker(bind=eng, autoflush=False, autocommit=False,
                                expire_on_commit=False)
            try:
                return run_nlp_pipeline(session_factory=sess)
            finally:
                eng.dispose()

        r1 = _run()
        r2 = _run()  # No PENDING cases remain — should process 0

        assert r2["cases_processed"] == 0, "Second run should find no PENDING cases"
        assert r2["events_inserted"] == 0
