"""db/__init__.py – exposes the public database API surface."""

from .base import Base, engine, SessionLocal, get_db  # noqa: F401
from . import models  # noqa: F401  – ensure models are registered on Base
