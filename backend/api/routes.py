"""
api/routes.py
─────────────
FastAPI route handlers for Legal Timeline Construction and Visualization API.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from db.base import get_db
from db.models import Case, CaseStatus, Event, TemporalRelation
from nlp.pipeline import run_nlp_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# ── Background Task Runner ───────────────────────────────────────────────────

def trigger_background_nlp_pipeline():
    """Wrapper to safely execute pipeline in background."""
    try:
        run_nlp_pipeline()
    except Exception as e:
        logger.error("Background NLP pipeline failed: %s", e, exc_info=True)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/cases/upload")
async def upload_case(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = None,
    case_citation: Optional[str] = Form(None),
    court_name: Optional[str] = Form(None),
    raw_text: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Accepts text or JSON file upload or form-based payload.
    Creates a new Case with status=PENDING, schedules background processing,
    and immediately returns the case UUID.
    """
    content = ""
    citation = case_citation or "Uploaded Case"
    court = court_name or "Generic Court"

    # 1. Handle file upload
    if file:
        try:
            bytes_content = await file.read()
            content = bytes_content.decode("utf-8")
            # If JSON, try to parse details
            if file.filename and file.filename.endswith(".json"):
                try:
                    data = json.loads(content)
                    if isinstance(data, dict):
                        citation = data.get("case_citation", citation)
                        court = data.get("court_name", court)
                        content = data.get("text", data.get("raw_text", content))
                except json.JSONDecodeError:
                    pass
            elif not case_citation and file.filename:
                # Deduce citation from filename (without extension)
                citation = file.filename.rsplit(".", 1)[0]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    # 2. Handle raw text parameter
    elif raw_text:
        content = raw_text
    else:
        raise HTTPException(
            status_code=400,
            detail="Either a file upload or non-empty raw_text parameter must be provided.",
        )

    if not content.strip():
        raise HTTPException(status_code=400, detail="Case content raw text cannot be empty.")

    # 3. Create Case record
    case = Case(
        case_citation=citation,
        court_name=court,
        raw_text=content,
        status=CaseStatus.PENDING,
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    # 4. Trigger NLP and Graph construction pipeline in background
    background_tasks.add_task(trigger_background_nlp_pipeline)

    return {"case_id": case.id}


@router.get("/cases")
def list_cases(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """
    Returns a paginated list of ingested cases.
    """
    total = db.query(Case).count()
    cases = db.query(Case).order_by(Case.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "results": [
            {
                "id": c.id,
                "case_citation": c.case_citation,
                "court_name": c.court_name,
                "status": c.status.value,
                "created_at": c.created_at.isoformat(),
            }
            for c in cases
        ],
    }


@router.get("/cases/{case_id}/status")
def get_case_status(
    case_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns the execution status of a specific case.
    """
    case = db.query(Case).filter(Case.id == case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    return {"status": case.status.value}


@router.get("/cases/{case_id}/timeline")
def get_case_timeline(
    case_id: str,
    db: Session = Depends(get_db),
):
    """
    Fetches events and temporal relations for a case, formatted for visualizers.
    """
    case = db.query(Case).filter(Case.id == case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    events = db.query(Event).filter(Event.case_id == case_id).order_by(Event.sentence_index).all()
    relations = db.query(TemporalRelation).filter(TemporalRelation.case_id == case_id).all()

    nodes = []
    for ev in events:
        nodes.append({
            "id": ev.id,
            "label": ev.trigger_word,
            "title": ev.event_description or ev.sentence_text,
            "start": ev.absolute_date_iso or "",
            "sentence_index": ev.sentence_index,
        })

    edges = []
    for rel in relations:
        edges.append({
            "id": rel.id,
            "from": rel.source_event_id,
            "to": rel.target_event_id,
            "label": rel.relation_type.value,
        })

    return {
        "case_info": {
            "id": case.id,
            "citation": case.case_citation,
            "court": case.court_name,
            "status": case.status.value,
        },
        "nodes": nodes,
        "edges": edges,
    }
