"""
tests/test_api.py
─────────────────
Integration tests for Phase 4 REST API.
"""

from __future__ import annotations

import io
import json
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.base import Base, get_db  # noqa: E402
from db.models import Case, CaseStatus, Event, TemporalRelation, RelationType  # noqa: E402
from main import app  # noqa: E402


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


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def test_db_env(tmp_path):
    """
    Creates an isolated SQLite test database and patches both the FastAPI
    dependency overrides and the pipeline's session bindings.
    """
    db_path = tmp_path / "api_test.db"
    engine = _make_engine(db_path)
    TestSessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )

    # 1. Override FastAPI database dependency
    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # 2. Patch the NLP pipeline SessionLocal import binding
    import nlp.pipeline as pipeline_mod
    original_pipeline_sl = pipeline_mod.SessionLocal
    pipeline_mod.SessionLocal = TestSessionLocal

    yield TestSessionLocal, db_path

    # Clean up
    app.dependency_overrides.pop(get_db, None)
    pipeline_mod.SessionLocal = original_pipeline_sl
    engine.dispose()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestAPIFlow:
    def test_root_endpoint(self):
        with TestClient(app) as client:
            response = client.get("/")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"

    def test_cases_upload_raw_text(self, test_db_env):
        TestSessionLocal, db_path = test_db_env
        with TestClient(app) as client:
            # Post raw_text
            response = client.post(
                "/api/cases/upload",
                data={
                    "case_citation": "Test Upload Citation 1",
                    "court_name": "Delhi High Court",
                    "raw_text": "The accused Suresh was arrested on 14th August 2023. Subsequently, bail was granted.",
                },
            )
            assert response.status_code == 200
            res_data = response.json()
            assert "case_id" in res_data
            case_id = res_data["case_id"]

            # Verify case metadata directly via SQLite
            conn = sqlite3.connect(str(db_path))
            try:
                row = conn.execute(
                    "SELECT case_citation, status FROM cases WHERE id = ?", (case_id,)
                ).fetchone()
                # Due to TestClient execution, background tasks run synchronously.
                # So status should have transitioned to COMPLETED.
                assert row is not None
                assert row[0] == "Test Upload Citation 1"
                assert row[1] == "COMPLETED"

                # Check that events and relations were created
                ev_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
                assert ev_count > 0
            finally:
                conn.close()

    def test_cases_upload_file_text(self, test_db_env):
        TestSessionLocal, db_path = test_db_env
        with TestClient(app) as client:
            file_data = {
                "case_citation": "File Citation",
                "court_name": "Kerala High Court",
            }
            # Mock text file
            file_payload = {"file": ("judgment.txt", b"FIR was registered on 10th June 2024. Arrest followed.")}
            
            response = client.post("/api/cases/upload", data=file_data, files=file_payload)
            assert response.status_code == 200
            case_id = response.json()["case_id"]

            # Verify
            conn = sqlite3.connect(str(db_path))
            try:
                row = conn.execute("SELECT court_name, status FROM cases WHERE id = ?", (case_id,)).fetchone()
                assert row is not None
                assert row[0] == "Kerala High Court"
                assert row[1] == "COMPLETED"
            finally:
                conn.close()

    def test_list_cases_and_status(self, test_db_env):
        TestSessionLocal, db_path = test_db_env
        # Seed 1 case
        with TestSessionLocal() as sess:
            c = Case(case_citation="List Cit", court_name="Bombay High Court", status=CaseStatus.PROCESSING)
            sess.add(c)
            sess.commit()
            case_id = c.id

        with TestClient(app) as client:
            # 1. Get status endpoint
            status_resp = client.get(f"/api/cases/{case_id}/status")
            assert status_resp.status_code == 200
            assert status_resp.json()["status"] == "PROCESSING"

            # 2. Get cases listing
            list_resp = client.get("/api/cases?skip=0&limit=10")
            assert list_resp.status_code == 200
            list_data = list_resp.json()
            assert list_data["total"] == 1
            assert list_data["results"][0]["case_citation"] == "List Cit"

    def test_get_timeline_json_shape(self, test_db_env):
        TestSessionLocal, db_path = test_db_env
        # Seed 1 completed case with events and relations
        with TestSessionLocal() as sess:
            c = Case(case_citation="Timeline Cit", court_name="Kerala High Court", status=CaseStatus.COMPLETED)
            sess.add(c)
            sess.flush()

            ev1 = Event(case_id=c.id, trigger_word="arrest", sentence_text="Arrested on 1st April 2024", absolute_date_iso="2024-04-01", sentence_index=1)
            ev2 = Event(case_id=c.id, trigger_word="bail", sentence_text="Bail granted on 2nd April 2024", absolute_date_iso="2024-04-02", sentence_index=2)
            sess.add_all([ev1, ev2])
            sess.flush()

            rel = TemporalRelation(case_id=c.id, source_event_id=ev1.id, target_event_id=ev2.id, relation_type=RelationType.BEFORE)
            sess.add(rel)
            sess.commit()
            case_id = c.id
            ev1_id, ev2_id, rel_id = ev1.id, ev2.id, rel.id

        with TestClient(app) as client:
            resp = client.get(f"/api/cases/{case_id}/timeline")
            assert resp.status_code == 200
            data = resp.json()

            # Verify Case info
            assert data["case_info"]["citation"] == "Timeline Cit"
            assert data["case_info"]["status"] == "COMPLETED"

            # Verify Nodes
            nodes = data["nodes"]
            assert len(nodes) == 2
            n1 = [n for n in nodes if n["id"] == ev1_id][0]
            assert n1["label"] == "arrest"
            assert n1["start"] == "2024-04-01"
            assert n1["sentence_index"] == 1

            # Verify Edges
            edges = data["edges"]
            assert len(edges) == 1
            assert edges[0]["id"] == rel_id
            assert edges[0]["from"] == ev1_id
            assert edges[0]["to"] == ev2_id
            assert edges[0]["label"] == "BEFORE"
