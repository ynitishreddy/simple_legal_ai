"""
nlp/extractor.py
────────────────
Temporal entity extraction for Indian legal judgments.

Architecture: spaCy rule-based + regex hybrid (no GPU required).

Extracts:
  • Absolute dates   — "14th August 2023", "23-07-2024", "July 2023"
  • Relative markers — "3 days after", "two weeks later", "the following month"
  • Event triggers   — verb phrases signalling legally significant acts
                       (arrest, file, order, hear, convict, acquit, etc.)

Returns a list of ExtractedEvent dataclasses, one per sentence that
contains at least one event trigger AND at least one temporal anchor
(absolute date) OR a relative marker.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import dateparser
import spacy
from spacy.matcher import Matcher

logger = logging.getLogger(__name__)

# ── spaCy model ───────────────────────────────────────────────────────────────
# We use the small English model.  If it is not installed we fall back to a
# blank model with a sentenciser so the code still runs (just without POS tags).

_NLP: Optional[spacy.language.Language] = None


def _get_nlp() -> spacy.language.Language:
    global _NLP
    if _NLP is not None:
        return _NLP
    try:
        _NLP = spacy.load("en_core_web_sm")
        logger.info("Loaded spaCy model: en_core_web_sm")
    except OSError:
        logger.warning(
            "en_core_web_sm not found — falling back to blank English model. "
            "Run: python -m spacy download en_core_web_sm"
        )
        _NLP = spacy.blank("en")
        # Add a simple sentence segmenter
        _NLP.add_pipe("sentencizer")
    return _NLP


# ── Regex patterns ────────────────────────────────────────────────────────────

# Absolute date patterns (Indian legal document style)
_ABS_DATE_PATTERNS = [
    # "14th August 2023", "1st January 2024"
    r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|"
    r"July|August|September|October|November|December)\s+\d{4}\b",
    # "August 2023", "January 2024"
    r"\b(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{4}\b",
    # "23-07-2024", "23/07/2024", "23.07.2024"
    r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b",
    # "2023-07-23" (ISO)
    r"\b\d{4}-\d{2}-\d{2}\b",
    # "23.07.2024" already covered above
]
_ABS_DATE_RE = re.compile("|".join(_ABS_DATE_PATTERNS), re.IGNORECASE)

# Relative temporal markers
_REL_MARKER_RE = re.compile(
    r"\b(?:"
    r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred)\s+"
    r"(?:day|week|month|year)s?\s+(?:after|before|later|prior|earlier)|"
    r"the\s+(?:following|next|preceding|previous)\s+(?:day|week|month|year)|"
    r"(?:subsequently|thereafter|therefrom|thenceforth|henceforth)|"
    r"(?:soon\s+after|shortly\s+after|immediately\s+after)|"
    r"(?:prior\s+to|subsequent\s+to)|"
    r"(?:on\s+the\s+same\s+day)|"
    r"(?:within\s+\d+\s+(?:day|week|month|year)s?)"
    r")\b",
    re.IGNORECASE,
)

# Legal event trigger verbs (lemma forms)
_EVENT_TRIGGERS = {
    # Criminal
    "arrest", "detain", "remand", "charge", "prosecute", "convict", "acquit",
    "sentence", "bail", "custody", "fir", "challan",
    # Civil / procedural
    "file", "petition", "appeal", "apply", "institute", "lodge",
    "hear", "argue", "submit", "order", "direct", "stay", "dismiss",
    "allow", "grant", "reject", "confirm", "affirm", "modify", "reverse",
    "set aside", "quash", "uphold",
    # Contract / property
    "execute", "register", "transfer", "lease", "mortgage", "assign",
    "terminate", "breach", "enforce",
    # General procedural
    "appoint", "constitute", "notify", "serve", "issue", "sign", "date",
    "decide", "hold", "rule", "find", "observe",
}

# Noun-phrase triggers (legal events expressed as nouns)
_NOUN_TRIGGERS = {
    "arrest", "detention", "remand", "conviction", "acquittal", "sentence",
    "bail", "petition", "appeal", "application", "order", "judgment",
    "decree", "injunction", "stay", "dismissal", "hearing", "trial",
    "complaint", "fir", "charge", "charge-sheet", "chargesheet",
    "registration", "transfer", "execution", "termination", "breach",
    "appointment", "notification", "service", "decision", "ruling", "finding",
}


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class ExtractedEvent:
    """One legally significant event extracted from a single sentence."""
    sentence_text: str
    trigger_word: str                   # The verb or noun that named the event
    event_description: str              # Cleaned 1-line description

    # Temporal anchors
    absolute_date_raw: Optional[str] = None     # Raw string, e.g. "14th August 2023"
    absolute_date_iso: Optional[str] = None     # ISO-8601 date, e.g. "2023-08-14"
    relative_marker: Optional[str] = None       # e.g. "3 days after"

    # Position in source text
    sentence_index: int = 0
    char_start: int = 0
    char_end: int = 0

    # Confidence 0–1
    confidence: float = 1.0

    # Extra dates found in sentence (beyond the primary one)
    secondary_dates: list[str] = field(default_factory=list)


# ── Extractor class ───────────────────────────────────────────────────────────

class EventExtractor:
    """
    Extract temporal events from raw legal text.

    Usage::

        extractor = EventExtractor()
        events = extractor.extract(case.raw_text)
    """

    def __init__(self):
        self._nlp = _get_nlp()
        self._dateparser_settings = {
            "DATE_ORDER": "DMY",          # Indian convention
            "PREFER_DAY_OF_MONTH": "first",
            "RETURN_AS_TIMEZONE_AWARE": False,
        }

    # ── Public API ────────────────────────────────────────────────────────────

    def extract(self, text: str) -> list[ExtractedEvent]:
        """
        Parse *text* and return a list of ExtractedEvent objects.
        Only sentences containing at least one trigger AND one temporal
        reference (absolute date or relative marker) are returned.
        """
        if not text or not text.strip():
            return []

        doc = self._nlp(text)
        events: list[ExtractedEvent] = []

        for sent_idx, sent in enumerate(doc.sents):
            sent_text = sent.text.strip()
            if not sent_text:
                continue

            # 1. Find temporal references
            abs_dates = self._find_absolute_dates(sent_text)
            rel_markers = self._find_relative_markers(sent_text)

            if not abs_dates and not rel_markers:
                continue  # No temporal anchor — skip sentence

            # 2. Find event triggers
            triggers = self._find_triggers(sent, sent_text)
            if not triggers:
                continue  # No legal event — skip sentence

            # 3. Build ExtractedEvent (one per sentence; primary trigger)
            primary_trigger = triggers[0]
            primary_date_raw = abs_dates[0] if abs_dates else None
            primary_date_iso = self._normalize_date(primary_date_raw) if primary_date_raw else None

            event = ExtractedEvent(
                sentence_text=sent_text,
                trigger_word=primary_trigger,
                event_description=self._clean_description(sent_text),
                absolute_date_raw=primary_date_raw,
                absolute_date_iso=primary_date_iso,
                relative_marker=rel_markers[0] if rel_markers else None,
                sentence_index=sent_idx,
                char_start=sent.start_char,
                char_end=sent.end_char,
                confidence=self._score_confidence(abs_dates, rel_markers, triggers),
                secondary_dates=abs_dates[1:],
            )
            events.append(event)

        logger.debug("extract(): %d events from %d chars", len(events), len(text))
        return events

    # ── Private helpers ───────────────────────────────────────────────────────

    def _find_absolute_dates(self, text: str) -> list[str]:
        return [m.group() for m in _ABS_DATE_RE.finditer(text)]

    def _find_relative_markers(self, text: str) -> list[str]:
        return [m.group() for m in _REL_MARKER_RE.finditer(text)]

    def _find_triggers(self, sent, sent_text: str) -> list[str]:
        """Return trigger words found in the sentence (lemma or noun match)."""
        found: list[str] = []

        # Token-level lemma match (verb triggers)
        for token in sent:
            lemma = token.lemma_.lower()
            if lemma in _EVENT_TRIGGERS:
                found.append(token.text)

        # Noun-phrase triggers (case-insensitive substring)
        sent_lower = sent_text.lower()
        for noun in _NOUN_TRIGGERS:
            if noun in sent_lower and noun not in [t.lower() for t in found]:
                found.append(noun)

        return found

    def _normalize_date(self, raw: str) -> Optional[str]:
        """Parse a raw date string to ISO-8601 (YYYY-MM-DD) or None."""
        try:
            parsed = dateparser.parse(raw, settings=self._dateparser_settings)
            if parsed:
                return parsed.date().isoformat()
        except Exception:
            pass
        return None

    @staticmethod
    def _clean_description(text: str) -> str:
        """Return a single-line, whitespace-normalised version of the sentence."""
        return " ".join(text.split())

    @staticmethod
    def _score_confidence(abs_dates: list, rel_markers: list, triggers: list) -> float:
        """Simple heuristic confidence score 0–1."""
        score = 0.5
        if abs_dates:
            score += 0.3
        if rel_markers:
            score += 0.1
        if len(triggers) > 1:
            score += 0.1
        return min(score, 1.0)
