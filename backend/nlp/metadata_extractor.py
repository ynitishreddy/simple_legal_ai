"""
nlp/metadata_extractor.py
─────────────────────────
Extracts metadata fields from legal judgment texts using NLP & regular expressions.
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

def extract_metadata(text: str) -> dict[str, str]:
    """
    Parse legal text and extract metadata fields.
    
    Returns a dict with:
        case_name, court_name, petitioner, respondent, judges,
        judgment_date, case_number, citation, acts, articles, sections
    """
    metadata = {
        "case_name": "",
        "court_name": "",
        "petitioner": "",
        "respondent": "",
        "judges": "",
        "judgment_date": "",
        "case_number": "",
        "citation": "",
        "acts": "",
        "articles": "",
        "sections": ""
    }
    
    if not text:
        return metadata

    # Search first 4000 characters for header fields (court, citation, parties, date, judges)
    header = text[:4000]
    
    # 1. Court Name
    court_match = re.search(
        r"(?:IN THE\s+)?(SUPREME COURT OF INDIA|HIGH COURT OF\s+[A-Z\s]+|HIGH COURT OF JUDICATURE\s+[A-Z\s,]+AT\s+[A-Z\s,]+)", 
        header, 
        re.IGNORECASE
    )
    if court_match:
        metadata["court_name"] = re.sub(r"\s+", " ", court_match.group(1)).strip().title()
    else:
        # Fallback to lines that look like a court name
        for line in header.split("\n"):
            line_upper = line.upper().strip()
            if "HIGH COURT" in line_upper or "SUPREME COURT" in line_upper:
                metadata["court_name"] = line.strip().title()
                break

    # 2. Case Number & Citation
    case_num_patterns = [
        r"(?:Criminal|Civil)?\s*(?:Appeal|Writ Petition|Petition|Revision|Application|Original Jurisdiction|C\.O\.)\s*(?:\(Crl\.?\)|\(Civil\)|\(Writ\))?\s*(?:No\.?|Nos\.?)\s*[\d\s/-]+of\s*\d{4}",
        r"(?:W\.P\.|Crl\.A\.|C\.O\.)\s*(?:No\.?)\s*[\d\s/-]+\s*(?:of|/)\s*\d{4}",
        r"SLP\s*(?:\(Crl\.?\)|\(C\))?\s*(?:No\.?)\s*[\d\s/-]+\s*(?:of|/)\s*\d{4}"
    ]
    for pattern in case_num_patterns:
        match = re.search(pattern, header, re.IGNORECASE)
        if match:
            metadata["case_number"] = re.sub(r"\s+", " ", match.group(0)).strip()
            metadata["citation"] = metadata["case_number"]
            break

    # 3. Petitioner / Respondent / Case Name
    parties_match = re.search(
        r"([A-Z][a-zA-Z0-9\s.,&()\-]+)\s+\.\.\.\s*(?:Petitioner|Appellant|Plaintiff|Complainant|Applicant)\s+(?:Versus|vs\.?|V/s)\s+([A-Z][a-zA-Z0-9\s.,&()\-]+)\s+\.\.\.\s*(?:Respondent|Defendant|State)",
        header,
        re.IGNORECASE
    )
    if parties_match:
        pet = re.sub(r"\s+", " ", parties_match.group(1)).strip()
        resp = re.sub(r"\s+", " ", parties_match.group(2)).strip()
        metadata["petitioner"] = pet
        metadata["respondent"] = resp
        metadata["case_name"] = f"{pet} v. {resp}"
    else:
        # Fallback to scanning lines for "versus" separators
        lines = header.split("\n")
        for idx, line in enumerate(lines):
            line_clean = line.strip().upper()
            if line_clean in ["VS", "VS.", "VERSUS", "V/S"]:
                p_candidate = lines[idx-1].strip() if idx > 0 else ""
                r_candidate = lines[idx+1].strip() if idx < len(lines)-1 else ""
                # Clean up punctuation and markers
                p_candidate = re.sub(r"^[0-9.\s]+", "", p_candidate)
                r_candidate = re.sub(r"^[0-9.\s]+", "", r_candidate)
                if p_candidate and r_candidate:
                    metadata["petitioner"] = p_candidate
                    metadata["respondent"] = r_candidate
                    metadata["case_name"] = f"{p_candidate} v. {r_candidate}"
                    break

    # 4. Judges
    judges_match = re.search(
        r"(?:CORAM|BEFORE|HON'BLE|PRESIDING)\s*:\s*(?:HON'BLE)?\s*(?:MR\.|MRS\.|JUSTICE)?\s*([A-Za-z. ,&\n\r]+)",
        header,
        re.IGNORECASE
    )
    if judges_match:
        j_text = judges_match.group(1).split("\n")[0].strip()
        metadata["judges"] = re.sub(r"\s+", " ", j_text)
    else:
        judges_found = []
        for line in header.split("\n"):
            line_clean = line.strip()
            if "JUSTICE" in line_clean.upper() and len(line_clean) < 100:
                name = re.sub(r"^(HON'BLE|MR\.|MRS\.|JUSTICE)\s*", "", line_clean, flags=re.IGNORECASE).strip()
                judges_found.append(name)
        if judges_found:
            metadata["judges"] = ", ".join(judges_found[:3])

    # 5. Judgment Date
    date_patterns = [
        r"(?:Date of Decision|Decided on|Pronounced on|Dated|Judgment Date)\s*:\s*([\d\w\s,.-]+)",
        r"(?:Date of Order|Order Date)\s*:\s*([\d\w\s,.-]+)",
        r"Dated\s+this\s+the\s+([\d\w\s,.-]+(?:day\s+of\s+[\d\w\s,.-]+)?)"
    ]
    for pattern in date_patterns:
        match = re.search(pattern, header, re.IGNORECASE)
        if match:
            metadata["judgment_date"] = match.group(1).strip()
            break
            
    if not metadata["judgment_date"]:
        # Match standard absolute dates (e.g. 14th March 2024 or September 23, 2023)
        date_match = re.search(
            r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b", 
            header, 
            re.IGNORECASE
        )
        if date_match:
            metadata["judgment_date"] = date_match.group(0)

    # 6. Acts, Sections, Articles (Scans full text)
    acts = set()
    for match in re.finditer(r"\b([A-Z][A-Za-z0-9\s.,()&]+Act)\b", text):
        act_name = match.group(1).strip()
        # Filter out common false positives
        if len(act_name) > 5 and not any(w in act_name.lower() for w in ["this", "said", "the"]):
            acts.add(act_name)
    if acts:
        metadata["acts"] = ", ".join(sorted(list(acts))[:4])
        
    articles = set()
    for match in re.finditer(r"\bArticle\s+(\d+[A-Za-z]*)\b", text, re.IGNORECASE):
        articles.add(f"Article {match.group(1)}")
    if articles:
        metadata["articles"] = ", ".join(sorted(list(articles))[:5])
        
    sections = set()
    # 1. Capture standard Section references
    for match in re.finditer(r"\b(?:Section|Sec\.?)\s+(\d+[A-Za-z]*)\b", text, re.IGNORECASE):
        sections.add(f"Section {match.group(1)}")
    # 2. Capture explicit IPC / Indian Penal Code references
    for match in re.finditer(r"\b(?:Section|Sec\.?)\s+(\d+[A-Za-z]*)\s+(?:of\s+the\s+)?(?:IPC|Indian\s+Penal\s+Code)\b", text, re.IGNORECASE):
        sections.add(f"Section {match.group(1)} IPC")
    for match in re.finditer(r"\bIPC\s+(?:Section|Sec\.?)\s+(\d+[A-Za-z]*)\b", text, re.IGNORECASE):
        sections.add(f"Section {match.group(1)} IPC")

    if sections:
        # Sort and limit to 12 most relevant sections
        metadata["sections"] = ", ".join(sorted(list(sections))[:12])

    # Clean multiple spaces and normalize results
    for key in metadata:
        val = re.sub(r"\s+", " ", str(metadata[key])).strip()
        # Capitalize list separators nicely
        if key in ["acts", "articles", "sections"] and val:
            pass
        metadata[key] = val
        
    return metadata
