"""
graph/builder.py
────────────────
Temporal Event Graph Construction module using NetworkX.

Extracts event ordering and builds a topologically sorted timeline of events.
Removes redundant temporal relations using transitive reduction.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from typing import Optional

import networkx as nx
from sqlalchemy.orm import Session

from db.models import Case, CaseStatus, Event, TemporalRelation, RelationType

logger = logging.getLogger(__name__)

NUM_MAP = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
    "ninety": 90, "hundred": 100
}


def parse_relative_marker(marker: str) -> tuple[int, str, int]:
    """
    Parse a relative marker string like 'three days later' or 'prior to'.
    Returns (number, unit, sign).
    Sign: +1 for future/after, -1 for past/before.
    """
    marker = marker.lower().strip()

    # Past indicators
    is_past = any(w in marker for w in ["before", "earlier", "prior", "preceding", "previous"])
    sign = -1 if is_past else 1

    # Extract numeric value
    num_pattern = r"\b(" + "|".join(list(NUM_MAP.keys()) + [r"\d+"]) + r")\b"
    num_match = re.search(num_pattern, marker)

    number = 1  # default
    if num_match:
        val = num_match.group(1)
        if val.isdigit():
            number = int(val)
        else:
            number = NUM_MAP.get(val, 1)

    # Extract unit
    unit = "day"
    if "week" in marker:
        unit = "week"
    elif "month" in marker:
        unit = "month"
    elif "year" in marker:
        unit = "year"

    # Specific common overrides
    if "same day" in marker:
        number = 0
        unit = "day"
        sign = 1
    elif "following day" in marker or "next day" in marker:
        number = 1
        unit = "day"
        sign = 1

    return number, unit, sign


def add_relative_time(base_date: date, number: int, unit: str, sign: int) -> date:
    """Calculate date offset based on base_date, duration, unit and sign."""
    if unit == "day":
        return base_date + timedelta(days=sign * number)
    elif unit == "week":
        return base_date + timedelta(weeks=sign * number)
    elif unit == "month":
        total_months = base_date.month - 1 + sign * number
        new_year = base_date.year + total_months // 12
        new_month = (total_months % 12) + 1
        try:
            return date(new_year, new_month, base_date.day)
        except ValueError:
            # Fallback for leap year / end of months issues
            for d in range(1, 4):
                try:
                    return date(new_year, new_month, base_date.day - d)
                except ValueError:
                    continue
            return date(new_year, new_month, 28)
    elif unit == "year":
        try:
            return date(base_date.year + sign * number, base_date.month, base_date.day)
        except ValueError:
            return date(base_date.year + sign * number, 2, 28)
    return base_date


class GraphBuilder:
    """
    Constructs, reduces and stores chronological event graphs.
    """

    def build_case_graph(self, case_id: str, db: Session) -> dict:
        """
        Loads all events for the given case_id, resolves relative dates,
        builds the NetworkX temporal graph, performs transitive reduction,
        and saves the optimized BEFORE / SIMULTANEOUS relationships to the DB.
        """
        case = db.query(Case).filter(Case.id == case_id).one_or_none()
        if not case:
            raise ValueError(f"Case {case_id} not found.")

        # 1. Load all events
        events = db.query(Event).filter(Event.case_id == case_id).all()
        if not events:
            logger.info("No events found for case %s. Completing graph step.", case_id)
            case.status = CaseStatus.COMPLETED
            db.commit()
            return {"before_inserted": 0, "simultaneous_inserted": 0}

        # 2. Resolve relative dates
        resolved_count = self._resolve_relative_dates(events, db)
        if resolved_count > 0:
            db.commit()
            # Reload to get updated date fields
            events = db.query(Event).filter(Event.case_id == case_id).all()

        # 3. Separate events into groups based on absolute_date_iso
        events_with_date = [e for e in events if e.absolute_date_iso]
        events_without_date = [e for e in events if not e.absolute_date_iso]

        # Group by absolute_date_iso
        groups: dict[str, list[Event]] = {}
        for ev in events_with_date:
            groups.setdefault(ev.absolute_date_iso, []).append(ev)

        # Sort dates chronologically
        sorted_dates = sorted(groups.keys())

        # 4. Construct DiGraph for BEFORE relations
        G = nx.DiGraph()
        # Add all event IDs as nodes
        for ev in events:
            G.add_node(ev.id)

        # Draw chronological BEFORE vectors between groups
        for i in range(len(sorted_dates) - 1):
            curr_date = sorted_dates[i]
            next_date = sorted_dates[i + 1]
            for ev_curr in groups[curr_date]:
                for ev_next in groups[next_date]:
                    G.add_edge(ev_curr.id, ev_next.id)

        # 5. Optimize via Transitive Reduction
        # transitive_reduction requires a DAG. Our chronological graph is a DAG
        # because chronological sequence (dates) cannot have loops.
        reduced_G = nx.transitive_reduction(G)

        # 6. Database Persistence
        # Clear existing temporal relations
        db.query(TemporalRelation).filter(TemporalRelation.case_id == case_id).delete()

        # Add reduced BEFORE relations
        relations_to_insert = []
        for src, tgt in reduced_G.edges():
            rel = TemporalRelation(
                case_id=case_id,
                source_event_id=src,
                target_event_id=tgt,
                relation_type=RelationType.BEFORE
            )
            relations_to_insert.append(rel)

        # Add SIMULTANEOUS relations for events sharing the exact same date
        simultaneous_count = 0
        for date_str, group in groups.items():
            if len(group) > 1:
                # To prevent mutual redundance, we can link them linearly or symmetrically
                # Let's insert them bidirectionally or in a sorted chain
                # Bidirectional representation matches natural SQL query expectations
                for i in range(len(group)):
                    for j in range(i + 1, len(group)):
                        rel = TemporalRelation(
                            case_id=case_id,
                            source_event_id=group[i].id,
                            target_event_id=group[j].id,
                            relation_type=RelationType.SIMULTANEOUS
                        )
                        relations_to_insert.append(rel)
                        simultaneous_count += 1

        db.bulk_save_objects(relations_to_insert)

        # Mark Case status as COMPLETED
        case.status = CaseStatus.COMPLETED
        db.commit()

        logger.info(
            "Graph construction complete for Case %s: "
            "resolved %d dates, %d BEFORE and %d SIMULTANEOUS inserted.",
            case_id, resolved_count, len(reduced_G.edges()), simultaneous_count
        )

        return {
            "resolved_dates": resolved_count,
            "before_inserted": len(reduced_G.edges()),
            "simultaneous_inserted": simultaneous_count,
        }

    def _resolve_relative_dates(self, events: list[Event], db: Session) -> int:
        """Find relative events and resolve their dates based on nearest absolute anchors."""
        resolved = 0
        for ev in events:
            if ev.absolute_date_iso or not ev.relative_marker:
                continue

            # Find the nearest absolute date anchor in sentence space
            anchors = [e for e in events if e.absolute_date_iso and e.id != ev.id]
            if not anchors:
                continue  # No anchor to base offset on

            # Find the closest anchor by sentence_index difference
            nearest_anchor = min(
                anchors,
                key=lambda a: (abs(a.sentence_index - ev.sentence_index), a.sentence_index)
            )

            # Parse and calculate the resolved date
            try:
                anchor_date = date.fromisoformat(nearest_anchor.absolute_date_iso)
                num, unit, sign = parse_relative_marker(ev.relative_marker)
                new_date = add_relative_time(anchor_date, num, unit, sign)

                ev.absolute_date_iso = new_date.isoformat()
                resolved += 1
            except Exception as e:
                logger.warning(
                    "Failed to resolve relative date for event %s using anchor %s: %s",
                    ev.id, nearest_anchor.id, e
                )

        return resolved
