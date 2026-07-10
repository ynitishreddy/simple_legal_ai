"""
tests/test_graph.py
───────────────────
Unit and integration tests for Phase 3: Temporal Event Graph Construction.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from datetime import date

import pytest
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.base import Base  # noqa: E402
from db.models import Case, CaseStatus, Event, TemporalRelation, RelationType  # noqa: E402
from graph.builder import GraphBuilder, parse_relative_marker, add_relative_time  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Relative Marker Parsing Units ─────────────────────────────────────────────

class TestRelativeMarkerParsing:
    def test_parse_days_later(self):
        num, unit, sign = parse_relative_marker("three days later")
        assert num == 3
        assert unit == "day"
        assert sign == 1

    def test_parse_weeks_after(self):
        num, unit, sign = parse_relative_marker("2 weeks after")
        assert num == 2
        assert unit == "week"
        assert sign == 1

    def test_parse_months_before(self):
        num, unit, sign = parse_relative_marker("one month before")
        assert num == 1
        assert unit == "month"
        assert sign == -1

    def test_parse_years_prior(self):
        num, unit, sign = parse_relative_marker("5 years prior to the order")
        assert num == 5
        assert unit == "year"
        assert sign == -1

    def test_parse_following_day(self):
        num, unit, sign = parse_relative_marker("the following day")
        assert num == 1
        assert unit == "day"
        assert sign == 1

    def test_parse_same_day(self):
        num, unit, sign = parse_relative_marker("on the same day")
        assert num == 0
        assert unit == "day"
        assert sign == 1


class TestRelativeTimeAddition:
    def test_add_days(self):
        dt = date(2023, 8, 14)
        res = add_relative_time(dt, 3, "day", 1)
        assert res == date(2023, 8, 17)

    def test_sub_weeks(self):
        dt = date(2023, 8, 14)
        res = add_relative_time(dt, 2, "week", -1)
        assert res == date(2023, 7, 31)

    def test_add_months_end_of_month(self):
        # 31 August + 1 month -> should safely land on 30 Sept
        dt = date(2023, 8, 31)
        res = add_relative_time(dt, 1, "month", 1)
        assert res == date(2023, 9, 30)

    def test_add_years_leap_year(self):
        # Leap year Feb 29 + 1 year -> should fall back to Feb 28
        dt = date(2024, 2, 29)
        res = add_relative_time(dt, 1, "year", 1)
        assert res == date(2025, 2, 28)


# ── Relative Anchor Resolution Integration ────────────────────────────────────

class TestRelativeAnchorResolution:
    def test_anchor_resolution_uses_nearest_sentence(self, tmp_path):
        db_path = tmp_path / "anchor_test.db"
        engine = _make_engine(db_path)
        Session = sessionmaker(bind=engine)

        with Session() as sess:
            case = Case(case_citation="Anchor Test Case 1", court_name="Test Court")
            sess.add(case)
            sess.flush()

            # E1 is at sentence 2, has date 2023-08-14
            ev1 = Event(
                case_id=case.id,
                trigger_word="arrest",
                absolute_date_iso="2023-08-14",
                sentence_index=2
            )
            # E2 is at sentence 3, relative: "3 days later"
            ev2 = Event(
                case_id=case.id,
                trigger_word="remanded",
                relative_marker="three days later",
                sentence_index=3
            )
            # E3 is at sentence 10, has date 2023-09-01 (further away)
            ev3 = Event(
                case_id=case.id,
                trigger_word="bail",
                absolute_date_iso="2023-09-01",
                sentence_index=10
            )
            sess.add_all([ev1, ev2, ev3])
            sess.flush()

            builder = GraphBuilder()
            events = [ev1, ev2, ev3]
            resolved = builder._resolve_relative_dates(events, sess)
            sess.commit()

            assert resolved == 1
            assert ev2.absolute_date_iso == "2023-08-17"

        engine.dispose()


# ── Transitive Reduction & Temporal Relations ─────────────────────────────────

class TestTransitiveReduction:
    def test_transitive_reduction_removes_shortcuts(self, tmp_path):
        db_path = tmp_path / "reduction_test.db"
        engine = _make_engine(db_path)
        Session = sessionmaker(bind=engine)

        with Session() as sess:
            case = Case(case_citation="Reduction Test Case 1", court_name="Test Court")
            sess.add(case)
            sess.flush()

            # E1 (Day 1) -> E2 (Day 2) -> E3 (Day 3)
            ev1 = Event(case_id=case.id, trigger_word="arrest", absolute_date_iso="2023-08-14", sentence_index=1)
            ev2 = Event(case_id=case.id, trigger_word="remanded", absolute_date_iso="2023-08-15", sentence_index=2)
            ev3 = Event(case_id=case.id, trigger_word="bail", absolute_date_iso="2023-08-16", sentence_index=3)
            sess.add_all([ev1, ev2, ev3])
            sess.flush()

            builder = GraphBuilder()
            result = builder.build_case_graph(case.id, sess)
            sess.commit()

            # We expect exactly 2 BEFORE relations: E1 -> E2 and E2 -> E3
            # E1 -> E3 is redundant and must be omitted by transitive reduction.
            relations = sess.query(TemporalRelation).filter_by(case_id=case.id).all()
            assert len(relations) == 2
            
            # Check edge set
            edges = {(r.source_event_id, r.target_event_id) for r in relations}
            assert (ev1.id, ev2.id) in edges
            assert (ev2.id, ev3.id) in edges
            assert (ev1.id, ev3.id) not in edges

        engine.dispose()

    def test_simultaneous_events_handled(self, tmp_path):
        db_path = tmp_path / "simultaneous_test.db"
        engine = _make_engine(db_path)
        Session = sessionmaker(bind=engine)

        with Session() as sess:
            case = Case(case_citation="Simultaneous Test Case 1", court_name="Test Court")
            sess.add(case)
            sess.flush()

            # E1 and E2 share the exact same date
            ev1 = Event(case_id=case.id, trigger_word="arrest", absolute_date_iso="2023-08-14", sentence_index=1)
            ev2 = Event(case_id=case.id, trigger_word="searched", absolute_date_iso="2023-08-14", sentence_index=2)
            # E3 is on a later date
            ev3 = Event(case_id=case.id, trigger_word="remanded", absolute_date_iso="2023-08-15", sentence_index=3)
            sess.add_all([ev1, ev2, ev3])
            sess.flush()

            builder = GraphBuilder()
            result = builder.build_case_graph(case.id, sess)
            sess.commit()

            # Simultaneous relation between E1 and E2 (unidirectional)
            sim_rels = sess.query(TemporalRelation).filter_by(
                case_id=case.id, relation_type=RelationType.SIMULTANEOUS
            ).all()
            assert len(sim_rels) == 1
            rel = sim_rels[0]
            assert {rel.source_event_id, rel.target_event_id} == {ev1.id, ev2.id}

            # Chronological progression edges from E1 -> E3 and E2 -> E3
            before_rels = sess.query(TemporalRelation).filter_by(
                case_id=case.id, relation_type=RelationType.BEFORE
            ).all()
            assert len(before_rels) == 2
            before_edges = {(r.source_event_id, r.target_event_id) for r in before_rels}
            assert (ev1.id, ev3.id) in before_edges
            assert (ev2.id, ev3.id) in before_edges

        engine.dispose()
