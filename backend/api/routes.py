"""
api/routes.py
─────────────
FastAPI route handlers for Legal Timeline Construction and Visualization API.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
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

@router.post("/cases/analyze-file")
async def analyze_file(
    file: UploadFile,
):
    """
    Analyzes an uploaded file (PDF, TXT, or JSON).
    Detects file type, extracts readable text (using OCR fallback if PDF is scanned),
    extracts metadata using NLP, and returns the parsed results for review.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Invalid file upload (missing filename).")

    file_name = file.filename
    ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    allowed_exts = {"pdf", "txt", "json"}
    allowed_mimes = {"application/pdf", "text/plain", "application/json"}
    if ext not in allowed_exts and file.content_type not in allowed_mimes:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only PDF, TXT, and JSON files are allowed."
        )

    file_size = 0
    ocr_run = False
    page_count = 0
    extracted_text = ""
    
    # Create temp directory in backend/temp if it doesn't exist
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file_name}")

    try:
        bytes_content = await file.read()
        file_size = len(bytes_content)
        
        # Safely write to temporary file
        with open(temp_file_path, "wb") as f:
            f.write(bytes_content)
        
        # 1. Detect file type and extract text
        if file_name.lower().endswith(".pdf"):
            from nlp.pdf_parser import extract_text_from_pdf
            extracted_text, ocr_run, page_count = extract_text_from_pdf(bytes_content, file_name)
        elif file_name.lower().endswith(".json"):
            try:
                data = json.loads(bytes_content.decode("utf-8"))
                if isinstance(data, dict):
                    extracted_text = data.get("text", data.get("raw_text", ""))
                    metadata_defaults = {
                        "case_name": data.get("case_name", data.get("case_citation", "")),
                        "court_name": data.get("court_name", ""),
                        "citation": data.get("case_citation", ""),
                        "petitioner": data.get("petitioner", ""),
                        "respondent": data.get("respondent", ""),
                        "judges": data.get("judges", ""),
                        "judgment_date": data.get("judgment_date", ""),
                        "case_number": data.get("case_number", ""),
                        "acts": data.get("acts", ""),
                        "articles": data.get("articles", ""),
                        "sections": data.get("sections", "")
                    }
                    if not extracted_text:
                        extracted_text = bytes_content.decode("utf-8")
                else:
                    extracted_text = bytes_content.decode("utf-8")
                    metadata_defaults = {}
            except Exception as json_err:
                logger.warning("Failed to parse JSON file: %s", json_err)
                extracted_text = bytes_content.decode("utf-8")
                metadata_defaults = {}
            page_count = 1
        else:
            extracted_text = bytes_content.decode("utf-8")
            page_count = 1
            metadata_defaults = {}

        if not extracted_text.strip():
            raise ValueError("File content is empty or unextractable.")
            
        # 2. Extract metadata
        from nlp.metadata_extractor import extract_metadata
        extracted_metadata = extract_metadata(extracted_text)
        
        # Merge defaults from JSON if present
        if file_name.lower().endswith(".json") and metadata_defaults:
            for k, v in metadata_defaults.items():
                if v and not extracted_metadata.get(k):
                    extracted_metadata[k] = v

        # Set fallbacks if citation or court is empty
        if not extracted_metadata.get("citation"):
            extracted_metadata["citation"] = file_name.rsplit(".", 1)[0]
        if not extracted_metadata.get("case_name"):
            extracted_metadata["case_name"] = extracted_metadata["citation"]
        if not extracted_metadata.get("court_name"):
            extracted_metadata["court_name"] = "Generic Court"

        return {
            "file_name": file_name,
            "file_size": file_size,
            "page_count": page_count,
            "ocr_run": ocr_run,
            "extracted_text": extracted_text,
            "metadata": extracted_metadata
        }

    except Exception as e:
        logger.error("File analysis failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Document parsing failed: {str(e)}"
        )
    finally:
        # Ensure cleanup of temp file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception as clean_err:
                logger.warning("Failed to remove temp file %s: %s", temp_file_path, clean_err)


@router.post("/cases/upload")
async def upload_case(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = None,
    case_citation: Optional[str] = Form(None),
    court_name: Optional[str] = Form(None),
    raw_text: Optional[str] = Form(None),
    petitioner: Optional[str] = Form(None),
    respondent: Optional[str] = Form(None),
    judges: Optional[str] = Form(None),
    judgment_date: Optional[str] = Form(None),
    case_number: Optional[str] = Form(None),
    acts: Optional[str] = Form(None),
    articles: Optional[str] = Form(None),
    sections: Optional[str] = Form(None),
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
        filename = file.filename or ""
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        allowed_exts = {"pdf", "txt", "json"}
        allowed_mimes = {"application/pdf", "text/plain", "application/json"}
        if ext not in allowed_exts and file.content_type not in allowed_mimes:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Only PDF, TXT, and JSON files are allowed."
            )

        temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{filename}")
        try:
            bytes_content = await file.read()
            with open(temp_file_path, "wb") as f:
                f.write(bytes_content)
                
            if filename.lower().endswith(".pdf"):
                from nlp.pdf_parser import extract_text_from_pdf
                content, _, _ = extract_text_from_pdf(bytes_content, filename)
            elif filename.lower().endswith(".json"):
                decoded_content = bytes_content.decode("utf-8")
                try:
                    data = json.loads(decoded_content)
                    if isinstance(data, dict):
                        citation = data.get("case_citation", citation)
                        court = data.get("court_name", court)
                        content = data.get("text", data.get("raw_text", decoded_content))
                except json.JSONDecodeError:
                    content = decoded_content
            else:
                content = bytes_content.decode("utf-8")

            if not case_citation and filename:
                # Deduce citation from filename (without extension)
                citation = filename.rsplit(".", 1)[0]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read/parse file: {e}")
        finally:
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception as clean_err:
                    logger.warning("Failed to remove temp file %s: %s", temp_file_path, clean_err)
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
        petitioner=petitioner,
        respondent=respondent,
        judges=judges,
        judgment_date=judgment_date,
        case_number=case_number,
        acts=acts,
        articles=articles,
        sections=sections,
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
    Returns the execution status of a specific case, including active step info.
    """
    case = db.query(Case).filter(Case.id == case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    return {
        "status": case.status.value,
        "progress_step": case.progress_step,
        "status_message": case.status_message,
    }


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
            "category": ev.category,
            "actor": ev.actor,
            "anchor_event_ref": ev.anchor_event_ref,
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
            "raw_text": case.raw_text,
            "petitioner": case.petitioner,
            "respondent": case.respondent,
            "judges": case.judges,
            "judgment_date": case.judgment_date,
            "case_number": case.case_number,
            "acts": case.acts,
            "articles": case.articles,
            "sections": case.sections,
        },
        "nodes": nodes,
        "edges": edges,
    }
