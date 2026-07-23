from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class LegalCategory(str, Enum):
    ARREST = "Arrest"
    CUSTODY = "Custody"
    INVESTIGATION = "Investigation"
    FIR = "FIR"
    CHARGE_SHEET = "Charge Sheet"
    EVIDENCE = "Evidence"
    WITNESS = "Witness"
    TRIAL = "Trial"
    BAIL = "Bail"
    APPEAL = "Appeal"
    JUDGMENT = "Judgment"
    CONVICTION = "Conviction"
    SENTENCE = "Sentence"
    OTHER = "Other"

class ExtractedEvent(BaseModel):
    trigger_word: str = Field(description="Action verb or key legal noun, e.g., 'arrested', 'filed', 'granted bail'")
    event_description: str = Field(description="Concise 1-sentence summary of the event")
    sentence_text: str = Field(description="Exact source sentence from the legal text")
    category: LegalCategory = Field(description="Primary legal classification category")
    actor: Optional[str] = Field(description="Primary actor involved, e.g., 'Petitioner', 'Police', 'High Court'")
    
    # Temporal Metadata
    absolute_date_raw: Optional[str] = Field(description="Raw date string if present, e.g., '14th August 2022', '12/04/2021'")
    relative_marker: Optional[str] = Field(description="Relative date phrase if no absolute date, e.g., '3 days later', 'two weeks after arrest'")
    anchor_event_ref: Optional[str] = Field(description="If relative marker present, reference the exact event or date it is relative to")
    confidence_score: float = Field(default=0.9, description="Confidence rating between 0.0 and 1.0")

class LegalEventsExtractionPayload(BaseModel):
    events: List[ExtractedEvent]
