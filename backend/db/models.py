"""
db/models.py
────────────
Core ORM models for the Legal Timeline project.

Entity Map
──────────
  Case ──< Event              (one Case → many Events)
  Case ──< TemporalRelation   (one Case → many TemporalRelations)
  Event ──< TemporalRelation  (source_event → many TemporalRelations)
  Event ──< TemporalRelation  (target_event → many TemporalRelations)

Notes on portability
────────────────────
• UUIDs are stored as strings in SQLite (no native UUID type).
  On PostgreSQL, swap ``String(36)`` for ``UUID(as_uuid=True)`` from
  ``sqlalchemy.dialects.postgresql``.
• Enums use SQLAlchemy's ``Enum`` with native_enum=False so they degrade
  gracefully to VARCHAR in SQLite while remaining proper ENUM in PostgreSQL.
• All timestamps default to UTC.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


# ── Enumerations ──────────────────────────────────────────────────────────────


class CaseStatus(str, enum.Enum):
    """Lifecycle status of a judgment document."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    NLP_COMPLETE = "NLP_COMPLETE"   # Phase 2 finished successfully
    FAILED = "FAILED"               # Processing error
    COMPLETED = "COMPLETED"         # All phases done


class RelationType(str, enum.Enum):
    """Allen's Interval Algebra relation types between two events."""

    BEFORE = "BEFORE"
    AFTER = "AFTER"
    OVERLAPS = "OVERLAPS"
    SIMULTANEOUS = "SIMULTANEOUS"


# ── Helper ────────────────────────────────────────────────────────────────────


def _new_uuid() -> str:
    """Return a fresh UUID4 as a hyphenated string."""
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Return current UTC time (timezone-aware)."""
    return datetime.now(tz=timezone.utc)


# ── Models ────────────────────────────────────────────────────────────────────


class Case(Base):
    """
    Represents a single legal judgment document.

    Columns
    -------
    id               : Primary key (UUID4 string).
    case_citation    : Official citation, e.g. "2023 SCC 142".
    court_name       : Full court name, e.g. "Bombay High Court".
    raw_text         : Original text extracted from source (S3 / PDF).
    parsed_text      : Cleaned / pre-processed text (populated by Phase 2).
    status           : Ingestion / processing lifecycle state.
    created_at       : UTC timestamp of record creation.
    """

    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid, index=True
    )
    case_citation: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    court_name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(
        Enum(CaseStatus, native_enum=False, length=20),
        nullable=False,
        default=CaseStatus.PENDING,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    
    # Ingestion tracking
    progress_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status_message: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Extracted legal profile metadata
    petitioner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    respondent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    judges: Mapped[str | None] = mapped_column(String(255), nullable=True)
    judgment_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    case_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acts: Mapped[str | None] = mapped_column(Text, nullable=True)
    articles: Mapped[str | None] = mapped_column(Text, nullable=True)
    sections: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    events: Mapped[list["Event"]] = relationship(
        "Event",
        back_populates="case",
        cascade="all, delete-orphan",
        lazy="select",
    )
    temporal_relations: Mapped[list["TemporalRelation"]] = relationship(
        "TemporalRelation",
        back_populates="case",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Case id={self.id!r} citation={self.case_citation!r} status={self.status}>"


class Event(Base):
    """
    A discrete legal event extracted from a Case judgment.

    Columns
    -------
    id                  : Primary key (UUID4 string).
    case_id             : FK → cases.id.
    trigger_word        : The verb/noun that named the event (e.g. "arrested").
    event_trigger       : Alias kept for backward compat — same as trigger_word.
    event_description   : Cleaned one-line description of the event sentence.
    sentence_text       : Original sentence text from the judgment.
    absolute_date_raw   : Raw date string as it appears in text.
    absolute_date_iso   : Normalised ISO-8601 date (YYYY-MM-DD).
    normalized_date     : Alias → absolute_date_iso parsed to a Python date.
    relative_marker     : Relative temporal expression (e.g. "3 days after").
    raw_context_snippet : Alias → sentence_text.
    sentence_index      : 0-based index of the sentence in the document.
    confidence          : Extraction confidence score 0–1.
    created_at          : UTC timestamp of record creation.
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid, index=True
    )
    case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Primary NLP output columns
    trigger_word: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    event_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    absolute_date_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    absolute_date_iso: Mapped[str | None] = mapped_column(String(10), nullable=True)
    relative_marker: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sentence_index: Mapped[int | None] = mapped_column(nullable=True, default=0)
    confidence: Mapped[float | None] = mapped_column(nullable=True, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    # ── Backward-compatible aliases (properties, not columns) ─────────────────
    @property
    def event_trigger(self) -> str:
        return self.trigger_word

    @property
    def normalized_date(self) -> date | None:
        if self.absolute_date_iso:
            try:
                from datetime import date as _date
                return _date.fromisoformat(self.absolute_date_iso)
            except ValueError:
                pass
        return None

    @property
    def raw_context_snippet(self) -> str | None:
        return self.sentence_text

    # ── Relationships ─────────────────────────────────────────────────────────
    case: Mapped["Case"] = relationship("Case", back_populates="events")

    source_relations: Mapped[list["TemporalRelation"]] = relationship(
        "TemporalRelation",
        foreign_keys="TemporalRelation.source_event_id",
        back_populates="source_event",
        cascade="all, delete-orphan",
        lazy="select",
    )
    target_relations: Mapped[list["TemporalRelation"]] = relationship(
        "TemporalRelation",
        foreign_keys="TemporalRelation.target_event_id",
        back_populates="target_event",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Event id={self.id!r} trigger={self.event_trigger!r} "
            f"date={self.normalized_date}>"
        )


class TemporalRelation(Base):
    """
    An Allen's Interval Algebra edge between two Events in the same Case.

    Columns
    -------
    id               : Primary key (UUID4 string).
    case_id          : FK → cases.id (denormalised for fast case-level queries).
    source_event_id  : FK → events.id (the "from" node of the directed edge).
    target_event_id  : FK → events.id (the "to" node of the directed edge).
    relation_type    : Temporal relation label (BEFORE, AFTER, OVERLAPS, SIMULTANEOUS).
    """

    __tablename__ = "temporal_relations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid, index=True
    )
    case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_event_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_event_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[RelationType] = mapped_column(
        Enum(RelationType, native_enum=False, length=20),
        nullable=False,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    case: Mapped["Case"] = relationship("Case", back_populates="temporal_relations")
    source_event: Mapped["Event"] = relationship(
        "Event",
        foreign_keys=[source_event_id],
        back_populates="source_relations",
    )
    target_event: Mapped["Event"] = relationship(
        "Event",
        foreign_keys=[target_event_id],
        back_populates="target_relations",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<TemporalRelation {self.source_event_id!r} "
            f"--[{self.relation_type}]--> {self.target_event_id!r}>"
        )
