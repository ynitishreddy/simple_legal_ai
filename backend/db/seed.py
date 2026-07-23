import json
import logging
from pathlib import Path
from db.base import SessionLocal
from db.models import Case
from ingestion.s3_streamer import clean_text, MOCK_DATA_PATH, _upsert_cases
from nlp.pipeline import run_nlp_pipeline

logger = logging.getLogger(__name__)

def seed_database(limit: int = 3):
    """
    Check if the database cases table is empty.
    If empty, load the first `limit` sample cases from judgments.json,
    upsert them, and run the NLP pipeline to process them to completion.
    """
    db = SessionLocal()
    try:
        case_count = db.query(Case).count()
        if case_count > 0:
            logger.info("Database already populated with %d cases. Skipping seeding.", case_count)
            return

        logger.info("Database is empty. Loading sample judgments from %s...", MOCK_DATA_PATH)
        if not MOCK_DATA_PATH.exists():
            logger.error("Sample judgments file not found at: %s", MOCK_DATA_PATH)
            return

        with open(MOCK_DATA_PATH, encoding="utf-8") as fh:
            documents = json.load(fh)

        # Ingest exactly the first `limit` cases
        seeded_docs = documents[:limit]
        logger.info("Found %d sample cases. Ingesting first %d...", len(documents), len(seeded_docs))

        # Clean text for each document
        for doc in seeded_docs:
            doc["text"] = clean_text(doc.get("text", ""))

        # Insert cases to DB
        inserted = _upsert_cases(seeded_docs, db)
        logger.info("Seeding: %d new case(s) successfully staged and committed.", inserted)

        # Process the seeded cases to completion using nlp pipeline
        if inserted > 0:
            logger.info("Triggering NLP pipeline to process seeded cases...")
            result = run_nlp_pipeline()
            logger.info("NLP pipeline seeding run finished: processed=%d failed=%d", 
                        result.get("cases_processed", 0), len(result.get("cases_failed", [])))

    except Exception as e:
        logger.error("Failed to seed database: %s", e, exc_info=True)
    finally:
        db.close()
