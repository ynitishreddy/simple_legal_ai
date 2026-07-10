"""
tests/conftest.py
─────────────────
Shared pytest fixtures for the Legal Timeline backend test suite.

Fixtures
────────
tmp_db_path      : Path to a temporary SQLite file (cleaned up after session).
db_engine        : SQLAlchemy Engine pointed at the temporary DB file.
db_session       : Transactional Session that is rolled back after each test.
populated_db     : Session that has been pre-populated via run_ingestion().
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

# ── Ensure backend root is on path ────────────────────────────────────────────
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from db.base import Base  # noqa: E402
from db import models  # noqa: F401, E402  – ensure models register on Base


# ── Temporary DB file ─────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def tmp_db_path(tmp_path_factory) -> Path:
    """Return a temporary path for the test SQLite database file."""
    return tmp_path_factory.mktemp("db") / "test_legal_timeline.db"


# ── Engine (per session) ──────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def db_engine(tmp_db_path):
    """
    Create and yield a SQLAlchemy engine backed by a temporary SQLite file.

    All tables are created before the session and dropped afterwards.
    """
    url = f"sqlite:///{tmp_db_path}"
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False},
        echo=False,
    )

    # Enable foreign key enforcement in SQLite.
    @event.listens_for(engine, "connect")
    def _fk_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


# ── Session (per test, rolled back) ──────────────────────────────────────────


@pytest.fixture
def db_session(db_engine) -> Session:
    """
    Provide a transactional Session that is rolled back after each test,
    keeping tests isolated.
    """
    connection = db_engine.connect()
    transaction = connection.begin()
    TestingSession = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = TestingSession()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# ── Pre-populated session (per session) ───────────────────────────────────────


@pytest.fixture(scope="session")
def populated_db(db_engine, tmp_db_path, monkeypatch_session):
    """
    Run run_ingestion() against the temporary DB and return a session.

    The database_url is monkey-patched so the streamer targets the temp file.
    """
    import config

    original_url = config.settings.database_url
    config.settings.database_url = f"sqlite:///{tmp_db_path}"

    # Patch the SessionLocal inside db.base to use our test engine.
    import db.base as db_base
    original_session_local = db_base.SessionLocal
    TestSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    db_base.SessionLocal = TestSession

    from ingestion.s3_streamer import run_ingestion
    run_ingestion()

    session = TestSession()
    yield session
    session.close()

    # Restore originals.
    db_base.SessionLocal = original_session_local
    config.settings.database_url = original_url


@pytest.fixture(scope="session")
def monkeypatch_session():
    """Session-scoped monkeypatch (stdlib workaround)."""
    # We handle patching manually in populated_db; this fixture is a stub.
    yield
