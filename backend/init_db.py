"""
init_db.py
──────────
Database provisioning script.

Run this once to create all tables in the configured database.
For local development, this creates ``legal_timeline.db`` (SQLite).
For production, point DATABASE_URL at a PostgreSQL server.

Usage
─────
  python init_db.py              # create / verify tables
  python init_db.py --drop-all   # ⚠ DROP all tables first, then recreate
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# ── Ensure backend root is on the path when run directly ─────────────────────
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from config import settings  # noqa: E402
from db.base import Base, engine  # noqa: E402
from db import models  # noqa: F401, E402  – register all models on Base

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] – %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)


def init_db(drop_all: bool = False) -> None:
    """
    Provision the database.

    Parameters
    ----------
    drop_all:
        If ``True``, drop all existing tables before (re)creating them.
        **Use only in development – this is destructive!**
    """
    log.info("Database URL: %s", settings.database_url)
    log.info("Registered models: %s", [t for t in Base.metadata.tables])

    if drop_all:
        log.warning("--drop-all specified: dropping all tables …")
        Base.metadata.drop_all(bind=engine)
        log.warning("All tables dropped.")

    log.info("Creating tables …")
    Base.metadata.create_all(bind=engine)
    log.info("Tables created successfully: %s", list(Base.metadata.tables.keys()))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Provision the Legal Timeline database schema."
    )
    parser.add_argument(
        "--drop-all",
        action="store_true",
        default=False,
        help="Drop all existing tables before creating them (DEV ONLY).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    init_db(drop_all=args.drop_all)
    print("\n[OK] Database initialised successfully.")
