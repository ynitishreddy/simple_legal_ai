"""
run_graph_test.py
──────────────────
Executable debugging script that processes the mock judgments, runs the NLP
and Graph Builder pipeline, and prints details of the generated graph for one case.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Ensure local test file config
os.environ["DATABASE_URL"] = "sqlite:///legal_timeline.db"

import init_db
from db.base import SessionLocal, engine
from db.models import Case, Event, TemporalRelation
from ingestion.s3_streamer import run_ingestion
from nlp.pipeline import run_nlp_pipeline


def main():
    print("1. Initialising Database...")
    init_db.init_db(drop_all=True)
    print("   [OK] Schema provisioned.")

    print("\n2. Ingesting Mock Cases...")
    inserted = run_ingestion()
    print(f"   [OK] Ingested {inserted} cases.")

    print("\n3. Running NLP and Graph Construction Pipeline...")
    res = run_nlp_pipeline()
    print(f"   [OK] Processed cases: {res['cases_processed']}, Events created: {res['events_inserted']}")

    print("\n4. Querying temporal event graph details for a sample case...")
    with SessionLocal() as db:
        cases = db.query(Case).all()
        if not cases:
            print("   [ERROR] No cases found in the database.")
            return

        # Choose a case that has some events
        selected_case = None
        for c in cases:
            events_count = db.query(Event).filter(Event.case_id == c.id).count()
            if events_count > 0:
                selected_case = c
                break

        if not selected_case:
            print("   [ERROR] No cases with extracted events found.")
            return

        print(f"\n==================================================")
        print(f"Case:      {selected_case.case_citation}")
        print(f"Court:     {selected_case.court_name}")
        print(f"Status:    {selected_case.status}")
        print(f"==================================================")

        events = db.query(Event).filter(Event.case_id == selected_case.id).order_by(Event.sentence_index).all()
        print(f"\nNodes (Extracted Events):")
        for ev in events:
            date_str = ev.absolute_date_iso or "UNRESOLVED"
            print(f"  [{ev.id[:8]}] (Sent {ev.sentence_index}) [{date_str}] - Trigger: {ev.trigger_word} - Description: {ev.event_description[:80]}...")

        relations = db.query(TemporalRelation).filter(TemporalRelation.case_id == selected_case.id).all()
        print(f"\nEdges (Optimized Temporal Relations):")
        if not relations:
            print("  (No relationships inferred)")
        else:
            for rel in relations:
                print(f"  [{rel.source_event_id[:8]}] --({rel.relation_type})--> [{rel.target_event_id[:8]}]")
        print(f"==================================================\n")


if __name__ == "__main__":
    main()
