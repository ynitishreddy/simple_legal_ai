"""
db/base.py
──────────
SQLAlchemy engine, session factory, and declarative base.

Design decisions
────────────────
• The engine is created from ``settings.database_url``.
  – SQLite (default, local dev): "sqlite:///./legal_timeline.db"
  – PostgreSQL (production):     "postgresql+psycopg2://user:pass@host/db"

• ``connect_args={"check_same_thread": False}`` is applied only for SQLite
  (required for multi-threaded access, e.g. FastAPI background tasks).

• ``get_db()`` is a generator dependency compatible with both FastAPI and
  plain Python usage (``next(get_db())``).
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import settings


# ── Declarative Base ──────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """Shared base class for all ORM models."""
    pass


# ── Engine ────────────────────────────────────────────────────────────────────

def _make_engine() -> Engine:
    """
    Build the SQLAlchemy engine.

    SQLite-specific tweaks are applied automatically so the same codebase
    runs against both SQLite (dev) and PostgreSQL (prod) without changes.
    """
    is_sqlite = settings.database_url.startswith("sqlite")

    kwargs: dict = {}
    if is_sqlite:
        # SQLite does not support multi-thread by default.
        kwargs["connect_args"] = {"check_same_thread": False}

    eng = create_engine(
        settings.database_url,
        echo=(settings.app_env == "development"),
        **kwargs,
    )

    if is_sqlite:
        # Enable WAL mode and foreign-key enforcement for SQLite.
        @event.listens_for(eng, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return eng


engine: Engine = _make_engine()

# ── Session Factory ───────────────────────────────────────────────────────────

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


# ── Dependency / Context Manager ──────────────────────────────────────────────

def get_db() -> Generator[Session, None, None]:
    """
    Yield a database session and close it when done.

    Compatible with FastAPI's dependency injection::

        @router.get("/cases")
        def list_cases(db: Session = Depends(get_db)):
            ...

    Also usable as a plain generator::

        db = next(get_db())
        try:
            ...
        finally:
            db.close()
    """
    db: Session = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """Context-manager wrapper around ``get_db()`` for script usage."""
    gen = get_db()
    db = next(gen)
    try:
        yield db
    finally:
        try:
            next(gen)
        except StopIteration:
            pass
