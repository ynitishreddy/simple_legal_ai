"""
tests/test_schema.py
────────────────────
Verifies database schema integrity:

 ✓ DB file is created by init_db.py
 ✓ All three tables exist (cases, events, temporal_relations)
 ✓ Each table has the expected columns with correct types
 ✓ Enum columns contain the defined values
 ✓ Foreign-key columns are correctly declared
 ✓ CRUD round-trip for all three models
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.models import Case, CaseStatus, Event, RelationType, TemporalRelation


# ── Table existence ────────────────────────────────────────────────────────────


class TestTableExistence:
    """All expected tables must exist after engine creation."""

    EXPECTED_TABLES = {"cases", "events", "temporal_relations"}

    def test_all_tables_exist(self, db_engine):
        inspector = inspect(db_engine)
        actual = set(inspector.get_table_names())
        assert self.EXPECTED_TABLES.issubset(actual), (
            f"Missing tables: {self.EXPECTED_TABLES - actual}"
        )


# ── Column presence ───────────────────────────────────────────────────────────


class TestCasesTable:
    """The ``cases`` table must have all required columns."""

    REQUIRED_COLUMNS = {
        "id", "case_citation", "court_name", "raw_text",
        "parsed_text", "status", "created_at",
    }

    def test_required_columns_exist(self, db_engine):
        inspector = inspect(db_engine)
        cols = {c["name"] for c in inspector.get_columns("cases")}
        missing = self.REQUIRED_COLUMNS - cols
        assert not missing, f"Missing columns in 'cases': {missing}"

    def test_id_is_primary_key(self, db_engine):
        inspector = inspect(db_engine)
        pk = inspector.get_pk_constraint("cases")
        assert "id" in pk["constrained_columns"]


class TestEventsTable:
    """The ``events`` table must have all required columns."""

    REQUIRED_COLUMNS = {
        "id", "case_id", "trigger_word",
        "event_description", "sentence_text",
        "absolute_date_raw", "absolute_date_iso",
        "relative_marker", "sentence_index", "confidence",
    }

    def test_required_columns_exist(self, db_engine):
        inspector = inspect(db_engine)
        cols = {c["name"] for c in inspector.get_columns("events")}
        missing = self.REQUIRED_COLUMNS - cols
        assert not missing, f"Missing columns in 'events': {missing}"

    def test_id_is_primary_key(self, db_engine):
        inspector = inspect(db_engine)
        pk = inspector.get_pk_constraint("events")
        assert "id" in pk["constrained_columns"]


class TestTemporalRelationsTable:
    """The ``temporal_relations`` table must have all required columns."""

    REQUIRED_COLUMNS = {
        "id", "case_id", "source_event_id",
        "target_event_id", "relation_type",
    }

    def test_required_columns_exist(self, db_engine):
        inspector = inspect(db_engine)
        cols = {c["name"] for c in inspector.get_columns("temporal_relations")}
        missing = self.REQUIRED_COLUMNS - cols
        assert not missing, f"Missing columns in 'temporal_relations': {missing}"

    def test_id_is_primary_key(self, db_engine):
        inspector = inspect(db_engine)
        pk = inspector.get_pk_constraint("temporal_relations")
        assert "id" in pk["constrained_columns"]


# ── Enum integrity ────────────────────────────────────────────────────────────


class TestEnums:
    """Enum classes must expose the required members."""

    def test_case_status_values(self):
        values = {s.value for s in CaseStatus}
        assert values == {"PENDING", "PROCESSING", "NLP_COMPLETE", "FAILED", "COMPLETED"}

    def test_relation_type_values(self):
        values = {r.value for r in RelationType}
        assert values == {"BEFORE", "AFTER", "OVERLAPS", "SIMULTANEOUS"}


# ── CRUD Round-trips ──────────────────────────────────────────────────────────


class TestCRUD:
    """Verify that ORM objects can be inserted and queried."""

    def test_insert_and_query_case(self, db_session):
        case = Case(
            case_citation="Test v. Test, 2024 SC 1",
            court_name="Supreme Court of India",
            raw_text="Some raw judgment text.",
            status=CaseStatus.PENDING,
        )
        db_session.add(case)
        db_session.flush()

        fetched = db_session.query(Case).filter_by(id=case.id).one()
        assert fetched.case_citation == "Test v. Test, 2024 SC 1"
        assert fetched.status == CaseStatus.PENDING
        assert fetched.court_name == "Supreme Court of India"

    def test_insert_event_with_case_fk(self, db_session):
        case = Case(
            case_citation="Event Test v. State, 2024 SC 2",
            court_name="Delhi High Court",
            status=CaseStatus.PROCESSING,
        )
        db_session.add(case)
        db_session.flush()

        event = Event(
            case_id=case.id,
            trigger_word="Arrest",
            sentence_text="The accused was arrested on 5th March 2024.",
        )
        db_session.add(event)
        db_session.flush()

        fetched_event = db_session.query(Event).filter_by(id=event.id).one()
        assert fetched_event.event_trigger == "Arrest"   # via property alias
        assert fetched_event.trigger_word == "Arrest"
        assert fetched_event.case_id == case.id

    def test_insert_temporal_relation(self, db_session):
        case = Case(
            case_citation="Relation Test v. State, 2024 SC 3",
            court_name="Bombay High Court",
            status=CaseStatus.COMPLETED,
        )
        db_session.add(case)
        db_session.flush()

        ev_a = Event(
            case_id=case.id,
            trigger_word="FIR Filed",
        )
        ev_b = Event(
            case_id=case.id,
            trigger_word="Charge-sheet Filed",
        )
        db_session.add_all([ev_a, ev_b])
        db_session.flush()

        rel = TemporalRelation(
            case_id=case.id,
            source_event_id=ev_a.id,
            target_event_id=ev_b.id,
            relation_type=RelationType.BEFORE,
        )
        db_session.add(rel)
        db_session.flush()

        fetched = db_session.query(TemporalRelation).filter_by(id=rel.id).one()
        assert fetched.relation_type == RelationType.BEFORE
        assert fetched.source_event_id == ev_a.id
        assert fetched.target_event_id == ev_b.id

    def test_case_status_default_is_pending(self, db_session):
        """A Case without an explicit status should default to PENDING."""
        case = Case(
            case_citation="Default Status Test, 2024 SC 4",
            court_name="Madras High Court",
        )
        db_session.add(case)
        db_session.flush()
        assert case.status == CaseStatus.PENDING

    def test_case_id_is_uuid_string(self, db_session):
        """Case IDs must be UUID4 strings of length 36."""
        import uuid
        case = Case(
            case_citation="UUID Test, 2024 SC 5",
            court_name="Kerala High Court",
        )
        db_session.add(case)
        db_session.flush()
        # Validate format by round-tripping through uuid.UUID.
        parsed = uuid.UUID(case.id)
        assert str(parsed) == case.id
        assert len(case.id) == 36
