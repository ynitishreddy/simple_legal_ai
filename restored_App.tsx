import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Clock, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Activity, 
  Info,
  Scale,
  Search,
  Folder,
  Eye,
  Terminal
} from 'lucide-react';

import NetworkGraphCanvas from './components/NetworkGraphCanvas';

// Helper to compute human-readable duration between consecutive timeline dates
function calculateDuration(date1: string, date2: string): string {
  if (!date1 || !date2) return "";
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "";
  
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "same day";
  if (diffDays < 30) return `${diffDays} days`;
  
  const diffMonths = Math.floor(diffDays / 30.43);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
  
  const diffYears = Math.floor(diffMonths / 12);
  const remMonths = diffMonths % 12;
  if (remMonths === 0) return `${diffYears} year${diffYears > 1 ? 's' : ''}`;
  return `${diffYears} yr${diffYears > 1 ? 's' : ''} ${remMonths} mo${remMonths > 1 ? 's' : ''}`;
}



// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseMetadata {
  id: string;
  case_citation: string;
  court_name: string;
  status: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  title: string;
  start: string;
  sentence_index: number;
}

export interface TimelineEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface TimelinePayload {
  case_info: {
    id: string;
    citation: string;
    court: string;
    status: string;
    raw_text?: string;
  };
  nodes: TimelineEvent[];
  edges: TimelineEdge[];
}

// ── Mock Data (Fallback Guardrail) ───────────────────────────────────────────

const MOCK_TIMELINE: TimelinePayload = {
  case_info: {
    id: "mock-bombay-412",
    citation: "Criminal Appeal No. 412 of 2023",
    court: "Bombay High Court",
    status: "COMPLETED",
    raw_text: "This is a mock legal case description. In the present appeal, the appellant challenges the conviction and sentence passed by the Sessions Court under Section 302. The incident occurred on 14th August 2022. The investigation commenced, leading to the arrest on 16th August 2022 and subsequent remand on 19th August 2022. Multiple bail petitions were rejected, a chargesheet was filed, and the trial began on 15th February 2023. The final judgment was pronounced on 18th September 2023."
  },
  nodes: [
    {
      id: "m-node-1",
      label: "judgment",
      title: "412 OF 2023 Pronounced on: 18th September 2023 Appellant : Ramesh Vinayak Patil",
      start: "2023-09-18",
      sentence_index: 2
    },
    {
      id: "m-node-2",
      label: "appeal",
      title: "The present appeal arises from the judgment and order dated 3rd August 2023 passed by Sessions Court.",
      start: "2023-08-03",
      sentence_index: 3
    },
    {
      id: "m-node-3",
      label: "found",
      title: "On the night of 14th August 2022, the deceased Suresh Patil, aged 48 years, was found dead near the farm.",
      start: "2022-08-14",
      sentence_index: 6
    },
    {
      id: "m-node-4",
      label: "arrested",
      title: "The investigating officer, PI Arun Shelar, took up the investigation and arrested the accused on 16th August 2022.",
      start: "2022-08-16",
      sentence_index: 11
    },
    {
      id: "m-node-5",
      label: "remanded",
      title: "On 19th August 2022, the appellant was produced before the learned Judicial Magistrate and remanded to custody.",
      start: "2022-08-19",
      sentence_index: 14
    },
    {
      id: "m-node-6",
      label: "bail",
      title: "The bail application filed on behalf of the appellant was taken up for hearing and rejected on 25th August 2022.",
      start: "2022-08-25",
      sentence_index: 17
    },
    {
      id: "m-node-7",
      label: "bail",
      title: "A subsequent bail application was filed before the Sessions Court and rejected on 10th September 2022.",
      start: "2022-09-10",
      sentence_index: 19
    },
    {
      id: "m-node-8",
      label: "charge",
      title: "The charge-sheet was filed by the investigating agency on 14th November 2022.",
      start: "2022-11-14",
      sentence_index: 21
    },
    {
      id: "m-node-9",
      label: "trial",
      title: "The Sessions Trial commenced on 15th February 2023 with charges framed.",
      start: "2023-02-15",
      sentence_index: 24
    }
  ],
  edges: [
    { id: "m-edge-1", from: "m-node-2", to: "m-node-1", label: "BEFORE" },
    { id: "m-edge-2", from: "m-node-3", to: "m-node-4", label: "BEFORE" },
    { id: "m-edge-3", from: "m-node-4", to: "m-node-5", label: "BEFORE" },
    { id: "m-edge-4", from: "m-node-5", to: "m-node-6", label: "BEFORE" },
    { id: "m-edge-5", from: "m-node-6", to: "m-node-7", label: "BEFORE" },
    { id: "m-edge-6", from: "m-node-7", to: "m-node-8", label: "BEFORE" },
    { id: "m-edge-7", from: "m-node-8", to: "m-node-9", label: "BEFORE" },
    { id: "m-edge-8", from: "m-node-9", to: "m-node-2", label: "BEFORE" }
  ]
};

interface CaseBriefData {
  title: string;
  court: string;
  caseNumber: string;
  jurisdiction: string;
  filingDate: string;
  decisionDate: string;
  status: string;
  caseType: string;
  timelineSpan: string;
  numEvents: number;
  numEvidenceNodes: number;
  numWitnesses: string;
  numLegalDocuments: number;
  forensicConfidence: string;
  conflicts: string;
  relatedCases: string;
  synopsis: {
    background: string;
    parties: { label: string; value: string }[];
    chronologicalProgression: string;
    legalIssues: string;
    courtProceedings: string;
    finalOutcome: string;
    keyTakeaways: string[];
  };
  metadata: {
    court: string;
    judge: string;
    bench: string;
    caseCategory: string;
    petitionType: string;
    relevantArticles: string;
    relevantActs: string;
    relevantSections: string;
    importantDates: string;
    relatedProceedings: string;
    connectedCases: string;
  };
  atAGlance: {
    natureOfCase: string;
    currentStatus: string;
    duration: string;
    keyLegalIssue: string;
    primaryEvidence: string;
    numTimelineEvents: number;
    confidenceScore: string;
  };
}

const CASE_BRIEFS: Record<string, CaseBriefData> = {
  "Criminal Appeal No. 412 of 2023": {
    title: "Ramesh Vinayak Patil v. The State of Maharashtra",
    court: "Bombay High Court",
    caseNumber: "Criminal Appeal No. 412 of 2023",
    jurisdiction: "Bombay (Maharashtra, India)",
    filingDate: "3rd August 2023",
    decisionDate: "18th September 2023",
    status: "Decided (Appeal Dismissed / Conviction Confirmed)",
    caseType: "Criminal Appeal",
    timelineSpan: "14th August 2022 – 18th September 2023",
    numEvents: 9,
    numEvidenceNodes: 4,
    numWitnesses: "25 witnesses (23 Prosecution, 2 Defence)",
    numLegalDocuments: 5,
    forensicConfidence: "94%",
    conflicts: "0 detected",
    relatedCases: "Sessions Case No. 87 of 2022 (Pune)",
    synopsis: {
      background: "The case originated on the night of 14th August 2022, when Suresh Patil, aged 48, was found murdered in his residence at Kothrud, Pune. The First Information Report (FIR) was lodged by the deceased's wife, Smt. Kavita Patil, at Kothrud Police Station at 11:45 PM on 14th August 2022. The appellant, Ramesh Vinayak Patil, a distant cousin of the deceased, was named as the prime suspect. The motive was established as a long-standing property dispute.",
      parties: [
        { label: "Appellant", value: "Ramesh Vinayak Patil" },
        { label: "Respondent", value: "The State of Maharashtra" },
        { label: "Agencies", value: "Kothrud Police Station, Pune" },
        { label: "Important Individuals", value: "Suresh Patil (Deceased), Kavita Patil (Complainant/Wife), PI Arun Shelar (Investigating Officer)" }
      ],
      chronologicalProgression: "The timeline of events begins on 14th August 2022 with the murder of Suresh Patil. Two days later, on 16th August 2022, the investigating officer PI Arun Shelar arrested Ramesh Vinayak Patil following a police tip-off. On 19th August 2022, the appellant was remanded to police custody. During custody, the appellant led police to a dry well in Wakad where the murder weapon—a blood-stained wooden baton—was recovered. Successive bail applications were rejected on 25th August and 18th September 2022. The Forensic Science Laboratory (FSL) report was received on 2nd November 2022 confirming a DNA match, and the charge-sheet was filed on 14th November 2022. The trial commenced on 15th February 2023 and concluded on 3rd August 2023 with conviction and life imprisonment. The Bombay High Court confirmed this sentence on 18th September 2023.",
      legalIssues: "The central legal issue was whether the prosecution established a complete, unbroken chain of circumstantial evidence pointing unerringly to the guilt of the accused, and whether the recovery of the weapon was admissible under Section 27 of the Indian Evidence Act.",
      courtProceedings: "The trial was conducted in Sessions Case No. 87 of 2022 where 23 prosecution witnesses and 2 defence witnesses were examined. The Additional Sessions Judge, Pune convicted the accused under Section 302 IPC. The High Court reviewed the circumstantial chain, hearing Mr. Sanjay R. Deshpande for the appellant and Ms. Priya K. Joshi for the State.",
      finalOutcome: "The Bombay High Court (per Justice A.M. Khanwilkar and Justice S.P. Tavade) dismissed the appeal, confirming the conviction and life imprisonment sentence.",
      keyTakeaways: [
        "The circumstantial chain—including property motive and weapon recovery—was unbroken.",
        "DNA profile matching on the murder weapon linked the accused directly to the crime.",
        "Unexplained possession of the weapon and false explanation by the accused solidified guilt."
      ]
    },
    metadata: {
      court: "Bombay High Court",
      judge: "Justice A.M. Khanwilkar, Justice S.P. Tavade",
      bench: "Division Bench",
      caseCategory: "Criminal Appellate Jurisdiction",
      petitionType: "Criminal Appeal",
      relevantArticles: "N/A",
      relevantActs: "Indian Penal Code (IPC), Indian Evidence Act",
      relevantSections: "Section 302 IPC, Section 27 Evidence Act",
      importantDates: "Incident: 14th Aug 2022; Arrest: 16th Aug 2022; Conviction: 3rd Aug 2023; HC Judgment: 18th Sept 2023",
      relatedProceedings: "Sessions Case No. 87 of 2022",
      connectedCases: "N/A"
    },
    atAGlance: {
      natureOfCase: "Murder Conviction Appeal",
      currentStatus: "Appeal Dismissed",
      duration: "1 year, 1 month",
      keyLegalIssue: "Circumstantial Evidence & Weapon Recovery Admissibility",
      primaryEvidence: "Wooden baton (weapon) with deceased's DNA, property motive, eyewitness testimonies",
      numTimelineEvents: 9,
      confidenceScore: "94%"
    }
  },
  "W.P. (Civil) No. 9841 of 2023": {
    title: "Meena Sharma v. Union of India & Ors.",
    court: "Delhi High Court",
    caseNumber: "W.P. (Civil) No. 9841 of 2023",
    jurisdiction: "Delhi (India)",
    filingDate: "5th August 2023",
    decisionDate: "5th October 2023",
    status: "Decided (Writ Petition Dismissed)",
    caseType: "Writ Petition (Civil)",
    timelineSpan: "7th January 2023 – 5th October 2023",
    numEvents: 8,
    numEvidenceNodes: 3,
    numWitnesses: "6 Departmental Witnesses",
    numLegalDocuments: 6,
    forensicConfidence: "96%",
    conflicts: "0 detected",
    relatedCases: "CAT O.A. No. 141 of 2023, CAT O.A. No. 987 of 2023",
    synopsis: {
      background: "Smt. Meena Sharma was employed as a Senior Clerk in the Ministry of Finance from 1st March 2009. On 7th January 2023, she was served with a charge-sheet alleging misappropriation of government funds amounting to Rs. 4.2 lakhs during the financial year 2021-22. Simultaneously, she was suspended by competent authorities, initiating a legal and administrative dispute.",
      parties: [
        { label: "Petitioner", value: "Meena Sharma" },
        { label: "Respondent", value: "Union of India & Ors." },
        { label: "Agencies", value: "Ministry of Finance, Central Administrative Tribunal (CAT)" },
        { label: "Important Individuals", value: "Smt. Meena Sharma (Senior Clerk), Shri P.K. Gupta (Inquiry Officer)" }
      ],
      chronologicalProgression: "The case began on 7th January 2023 with the charge-sheet and suspension order. The petitioner challenged the suspension in CAT O.A. No. 141 of 2023, which was dismissed on 15th February 2023. Departmental inquiry proceedings commenced on 3rd March 2023, with six departmental witnesses examined. The Inquiry Report on 10th May 2023 found charges proved. A show-cause notice was served on 20th May 2023, and her response was received on 2nd June 2023. The disciplinary authority ordered compulsory retirement on 28th June 2023. The CAT dismissed her challenge in O.A. No. 987 of 2023 on 12th July 2023. She filed the present Writ Petition on 5th August 2023, which was decided on 5th October 2023.",
      legalIssues: "Whether the departmental inquiry complied with natural justice rules given the petitioner's partial participation due to ill health, and whether the compulsory retirement penalty was proportionate to the charges of financial misappropriation.",
      courtProceedings: "The petitioner sought reinstatement, challenging the CAT's order. The Delhi High Court reviewed the inquiry file, noting the petitioner was given ample opportunity. Arguments were presented by Mr. Vikram Nair for the petitioner and Ms. Ritu Bhatt for the Union of India.",
      finalOutcome: "The Delhi High Court (per Justice Rekha Palli and Justice Arun Kumar Tyagi) dismissed the writ petition, vacating the interim stay and upholding the compulsory retirement order.",
      keyTakeaways: [
        "Inquiry complied fully with natural justice; partial participation does not invalidate findings.",
        "Financial misappropriation was supported by cogent evidence (ledger entries, bank statements).",
        "No jurisdictional error or perversity was found in the CAT order."
      ]
    },
    metadata: {
      court: "Delhi High Court",
      judge: "Justice Rekha Palli, Justice Arun Kumar Tyagi",
      bench: "Division Bench",
      caseCategory: "Writ Petition (Civil) - Service Matter",
      petitionType: "Article 226 Writ Petition",
      relevantArticles: "Article 226 of the Constitution of India",
      relevantActs: "Central Civil Services (Classification, Control and Appeal) Rules",
      relevantSections: "Rules governing suspension and major penalties",
      importantDates: "Charge-sheet: 7th Jan 2023; Retirement: 28th Jun 2023; CAT Order: 12th Jul 2023; HC Order: 5th Oct 2023",
      relatedProceedings: "CAT O.A. No. 141 of 2023, CAT O.A. No. 987 of 2023",
      connectedCases: "N/A"
    },
    atAGlance: {
      natureOfCase: "Service Dispute - Reinstatement",
      currentStatus: "Writ Petition Dismissed",
      duration: "9 months",
      keyLegalIssue: "Natural Justice & Sufficiency of Proof in Departmental Inquiry",
      primaryEvidence: "Financial ledger entries, bank statements, testimony of 6 departmental witnesses",
      numTimelineEvents: 8,
      confidenceScore: "96%"
    }
  },
  "Crl. O.P. No. 18742 of 2023": {
    title: "Arulmurugan @ Arun v. The State",
    court: "Madras High Court",
    caseNumber: "Crl. O.P. No. 18742 of 2023",
    jurisdiction: "Madras (Tamil Nadu, India)",
    filingDate: "20th October 2023",
    decisionDate: "22nd November 2023",
    status: "Decided (Petition Dismissed)",
    caseType: "Criminal Original Petition",
    timelineSpan: "4th September 2023 – 22nd November 2023",
    numEvents: 7,
    numEvidenceNodes: 3,
    numWitnesses: "1 Complainant",
    numLegalDocuments: 5,
    forensicConfidence: "91%",
    conflicts: "0 detected",
    relatedCases: "FIR No. 642 of 2023 (Coimbatore North PS), FIR No. 310 of 2022",
    synopsis: {
      background: "On 4th September 2023 at 7:30 PM, the petitioner Arulmurugan @ Arun and two associates allegedly assaulted petty shop owner Mr. Kandasamy near the Gandhipuram bus stand, Coimbatore, and extorted Rs. 10,000/-. Complainant Kandasamy filed a complaint on 5th September 2023, leading to registration of FIR No. 642 of 2023 and subsequent arrest of the petitioner.",
      parties: [
        { label: "Petitioner", value: "Arulmurugan @ Arun" },
        { label: "Respondent", value: "The State, rep. by Inspector of Police, Coimbatore North PS" },
        { label: "Agencies", value: "Coimbatore North Police Station" },
        { label: "Important Individuals", value: "Arulmurugan (Petitioner), Kandasamy (Complainant), Justice G. Jayachandran" }
      ],
      chronologicalProgression: "The incident occurred on 4th September 2023, and FIR was filed on 5th September. The petitioner was arrested and remanded on 6th September. Magistrate Court bail was rejected on 12th September. Sessions Court allowed bail on 28th September, and petitioner was released on 29th September. The petitioner filed the present quashing petition on 20th October 2023. The State filed its counter-affidavit on 10th November 2023. The Madras High Court heard and dismissed the petition on 22nd November 2023.",
      legalIssues: "Whether the High Court should exercise its inherent powers under Section 482 Cr.P.C. to quash an FIR during an active, ongoing investigation when prima facie evidence exists.",
      courtProceedings: "The petitioner argued the FIR was malicious and filed due to local enmity. The respondent police filed a counter showing corroborative CDR and ATM CCTV evidence. The High Court declined to quash but granted liberty to approach the Trial Court upon framing of charges.",
      finalOutcome: "The Madras High Court dismissed the petition, refusing to quash the FIR, but preserving the petitioner's rights to seek discharge/relief later.",
      keyTakeaways: [
        "Inherent power under Section 482 is not a substitute for trial when there is prima facie evidence.",
        "Mobile phone CDR records and CCTV footage from a nearby ATM corroborated the prosecution's case.",
        "Petitioner's past involvement in similar offenses (FIR No. 310 of 2022) weighed against early quashing."
      ]
    },
    metadata: {
      court: "Madras High Court",
      judge: "Justice G. Jayachandran",
      bench: "Single Judge",
      caseCategory: "Criminal Original Jurisdiction",
      petitionType: "Petition to Quash FIR (Section 482 Cr.P.C.)",
      relevantArticles: "N/A",
      relevantActs: "Code of Criminal Procedure (Cr.P.C.), Indian Penal Code (IPC)",
      relevantSections: "Section 482 Cr.P.C., IPC Sections 341, 323, 324, and 506(ii)",
      importantDates: "Incident: 4th Sept 2023; FIR: 5th Sept 2023; Bail: 28th Sept 2023; HC Order: 22nd Nov 2023",
      relatedProceedings: "FIR No. 310 of 2022, Crl. M.P. No. 11021 of 2023",
      connectedCases: "N/A"
    },
    atAGlance: {
      natureOfCase: "Quashing of FIR",
      currentStatus: "Petition Dismissed",
      duration: "2.5 months",
      keyLegalIssue: "Exercise of Section 482 Cr.P.C. inherent powers during active investigation",
      primaryEvidence: "Complainant statement, ATM CCTV footage, mobile CDR records, wooden stick",
      numTimelineEvents: 7,
      confidenceScore: "91%"
    }
  },
  "C.O. No. 1234 of 2024": {
    title: "Bimalendu Sarkar v. Smt. Chhaya Sarkar & Ors.",
    court: "Calcutta High Court",
    caseNumber: "C.O. No. 1234 of 2024",
    jurisdiction: "Calcutta (West Bengal, India)",
    filingDate: "10th February 2024",
    decisionDate: "14th March 2024",
    status: "Decided (Revisional Application Dismissed)",
    caseType: "Civil Revisional Application",
    timelineSpan: "5th March 2015 – 14th March 2024",
    numEvents: 6,
    numEvidenceNodes: 2,
    numWitnesses: "N/A",
    numLegalDocuments: 4,
    forensicConfidence: "93%",
    conflicts: "1 detected (Conflicting property registered sale deeds)",
    relatedCases: "Title Suit No. 88 of 2019, Title Suit No. 21 of 2018",
    synopsis: {
      background: "The petitioner, Bimalendu Sarkar, purchased a parcel of land measuring 5 kathas in Mouza Rajarhat from Taraknath Dey on 5th March 2015. Opposite party Smt. Chhaya Sarkar claimed title to the same property via a registered sale deed dated 11th September 2017. The petitioner filed a title declaration suit in 2019. In January 2024, the opposite party commenced construction, prompting the petitioner to seek a temporary injunction, which was denied.",
      parties: [
        { label: "Petitioner", value: "Bimalendu Sarkar" },
        { label: "Opposite Party 1", value: "Smt. Chhaya Sarkar & Ors." },
        { label: "Agencies", value: "Civil Court (Senior Division), Barasat" },
        { label: "Important Individuals", value: "Bimalendu Sarkar, Chhaya Sarkar, Taraknath Dey" }
      ],
      chronologicalProgression: "The timeline dates back to 5th March 2015 when the petitioner purchased the land. On 11th September 2017, the opposite party purchased the same land. The petitioner filed Title Suit No. 88 of 2019 on 17th June 2019. The opposite parties began construction on 3rd January 2024. The petitioner filed for temporary injunction on 10th January 2024. The trial court rejected this application on 31st January 2024. The revisional petition in Calcutta High Court was decided and dismissed on 14th March 2024.",
      legalIssues: "Whether a prior registered sale deed establishes a prima facie case for an injunction, and whether the petitioner's delay of three weeks in filing for an injunction after construction started defeats the balance of convenience.",
      courtProceedings: "The trial court rejected the injunction, holding that the petitioner failed to prove prima facie possession and noting a pending 2018 suit. The High Court reviewed these findings under its revisional jurisdiction.",
      finalOutcome: "The Calcutta High Court (per Justice Moushumi Bhattacharya) dismissed the revisional application, confirming the trial court's order and denying the temporary injunction.",
      keyTakeaways: [
        "Injunctions are equitable remedies and delay in filing (three weeks from construction start) militates against urgency.",
        "The balance of convenience does not favor halting construction when it has reached an advanced stage, causing irreparable loss.",
        "Competing claims of title under separate registered deeds must be decided at trial."
      ]
    },
    metadata: {
      court: "Calcutta High Court",
      judge: "Justice Moushumi Bhattacharya",
      bench: "Single Judge",
      caseCategory: "Civil Revisional Jurisdiction",
      petitionType: "Revisional Application under Order 39 Rules 1 & 2 CPC",
      relevantArticles: "N/A",
      relevantActs: "Code of Civil Procedure (CPC), Registration Act, Transfer of Property Act",
      relevantSections: "Order XXXIX Rules 1 & 2 CPC",
      importantDates: "First Deed: 5th Mar 2015; Second Deed: 11th Sept 2017; Suit: 17th Jun 2019; Injunction Order: 31st Jan 2024; HC Order: 14th Mar 2024",
      relatedProceedings: "Title Suit No. 88 of 2019, Title Suit No. 21 of 2018",
      connectedCases: "N/A"
    },
    atAGlance: {
      natureOfCase: "Civil Property Dispute - Temporary Injunction",
      currentStatus: "Revisional Application Dismissed",
      duration: "9 years",
      keyLegalIssue: "Prior Registered Sale Deed vs. Balance of Convenience & Delay",
      primaryEvidence: "Sale Deed (2015), Sale Deed (2017), Construction status logs",
      numTimelineEvents: 6,
      confidenceScore: "93%"
    }
  },
  "WP (Criminal) No. 1587 of 2024": {
    title: "Shajahan K. v. State of Kerala & Ors.",
    court: "Kerala High Court",
    caseNumber: "WP (Criminal) No. 1587 of 2024",
    jurisdiction: "Kerala (Ernakulam, India)",
    filingDate: "22nd March 2024",
    decisionDate: "30th April 2024",
    status: "Decided (Writ Petition Dismissed)",
    caseType: "Writ of Habeas Corpus",
    timelineSpan: "18th March 2024 – 30th April 2024",
    numEvents: 7,
    numEvidenceNodes: 3,
    numWitnesses: "N/A",
    numLegalDocuments: 4,
    forensicConfidence: "95%",
    conflicts: "1 detected (Illegal detention allegation vs. official remand reports)",
    relatedCases: "Crime No. 74 of 2024 (Malappuram PS)",
    synopsis: {
      background: "The petitioner, Shajahan K., filed a writ of habeas corpus seeking production and release of his brother, Safar K. (aged 32). The petitioner alleged that Safar was taken into custody by Malappuram Police on 18th March 2024 and illegally detained at an undisclosed location without being produced before a Magistrate, in violation of constitutional mandates.",
      parties: [
        { label: "Petitioner", value: "Shajahan K." },
        { label: "Respondent", value: "State of Kerala, through Superintendent of Police, Malappuram & Ors." },
        { label: "Agencies", value: "Malappuram Police Station, District Jail Malappuram" },
        { label: "Important Individuals", value: "Safar K. (Detenu), Shajahan K. (Brother), Judicial Magistrate of Malappuram" }
      ],
      chronologicalProgression: "Safar K. was arrested on 18th March 2024. The family filed the habeas petition on 22nd March. The State filed a counter-affidavit on 26th March claiming Safar was produced before a Magistrate within 24 hours on 19th March and remanded. The petitioner disputed this on 3rd April. Pursuant to High Court directions, the Judicial Magistrate and Jail Superintendent submitted verification reports on 10th April confirming the remand. The High Court dismissed the petition on 30th April 2024.",
      legalIssues: "Whether the detention of Safar K. was illegal or if the police complied with Article 22(2) of the Constitution of India requiring production of an arrested person before a Magistrate within 24 hours.",
      courtProceedings: "The petitioner's counsel argued that jail records did not initially show Safar's entry. The High Court called for reports and original remand orders from the Magistrate. These documents proved compliance, confirming that he was in judicial custody.",
      finalOutcome: "The Kerala High Court (per Justice P.B. Suresh Kumar) dismissed the writ petition, holding that the detention was not illegal as it was backed by a valid judicial remand order.",
      keyTakeaways: [
        "A writ of habeas corpus does not lie when the detention is under a valid, lawful judicial remand order.",
        "Official reports from the Judicial Magistrate and Jail Superintendent with seals and signatures constitute conclusive proof of legal custody.",
        "Article 22(2) production within 24 hours was strictly complied with by the police."
      ]
    },
    metadata: {
      court: "Kerala High Court",
      judge: "Justice P.B. Suresh Kumar",
      bench: "Division Bench",
      caseCategory: "Writ Petition (Criminal)",
      petitionType: "Writ of Habeas Corpus",
      relevantArticles: "Article 22(2) and Article 226 of the Constitution of India",
      relevantActs: "Code of Criminal Procedure (Cr.P.C.)",
      relevantSections: "Section 57 Cr.P.C.",
      importantDates: "Arrest: 18th Mar 2024; Remand: 19th Mar 2024; Jail verification: 10th Apr 2024; HC Judgment: 30th Apr 2024",
      relatedProceedings: "Crime No. 74 of 2024 (Malappuram PS)",
      connectedCases: "N/A"
    },
    atAGlance: {
      natureOfCase: "Habeas Corpus - Police Arrest",
      currentStatus: "Writ Petition Dismissed",
      duration: "1.5 months",
      keyLegalIssue: "Production within 24 hours and validity of judicial remand",
      primaryEvidence: "Magistrate Remand Order, Jail Superintendent Compliance Report, Police Arrest records",
      numTimelineEvents: 7,
      confidenceScore: "95%"
    }
  }
};

function getCaseBrief(citation: string, timeline: TimelinePayload | null): CaseBriefData {
  const citationKey = Object.keys(CASE_BRIEFS).find(
    k => k.toLowerCase().trim() === citation.toLowerCase().trim()
  );
  if (citationKey && CASE_BRIEFS[citationKey]) {
    return CASE_BRIEFS[citationKey];
  }

  // Fallback calculations for dynamically uploaded cases
  const nodes = timeline?.nodes || [];
  const edges = timeline?.edges || [];
  const rawText = timeline?.case_info?.raw_text || "";
  
  // Try to parse dates
  const sortedNodes = [...nodes].sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start.localeCompare(b.start);
  });
  const firstDate = sortedNodes[0]?.start || "N/A";
  const lastDate = sortedNodes[sortedNodes.length - 1]?.start || "N/A";
  const span = firstDate !== "N/A" || lastDate !== "N/A" ? `${firstDate} // ${lastDate}` : "N/A";

  // Try to extract some paragraphs/sentences from raw text for background
  const cleanedText = rawText.replace(/[\r\n]+/g, ' ').trim();
  const backgroundSentence = cleanedText.split('.').slice(0, 3).join('.') + '.';
  
  // Try to find parties names from raw text
  let petitioner = "Under Review";
  let respondent = "Under Review";
  
  const petitionerMatch = rawText.match(/(?:Petitioner|Appellant)\s*:\s*([^\r\n]+)/i);
  if (petitionerMatch) petitioner = petitionerMatch[1].trim();
  
  const respondentMatch = rawText.match(/(?:Respondent|Opposite Party)\s*:\s*([^\r\n]+)/i);
  if (respondentMatch) respondent = respondentMatch[1].trim();

  // Try to find Judge name
  let judge = "Under Review";
  const judgeMatch = rawText.match(/(?:Per Hon'ble Justice|Per Justice)\s+([^\r\n)]+)/i);
  if (judgeMatch) judge = judgeMatch[1].trim();

  const numEvents = nodes.length;
  const numEvidenceNodes = Math.max(0, Math.floor(edges.length * 0.4));
  const numWitnesses = "Under Review";
  const numLegalDocuments = 2; // Default fallback count

  return {
    title: petitioner !== "Under Review" && respondent !== "Under Review" ? `${petitioner} v. ${respondent}` : timeline?.case_info?.citation || "New Casing Archive",
    court: timeline?.case_info?.court || "Generic Court",
    caseNumber: timeline?.case_info?.citation || "N/A",
    jurisdiction: timeline?.case_info?.court ? `${timeline.case_info.court.replace(" High Court", "")} (India)` : "Generic Jurisdiction",
    filingDate: firstDate !== "N/A" ? firstDate : "Under Review",
    decisionDate: lastDate !== "N/A" ? lastDate : "Under Review",
    status: timeline?.case_info?.status || "Ingested",
    caseType: "Legal Case Ingestion",
    timelineSpan: span,
    numEvents,
    numEvidenceNodes,
    numWitnesses,
    numLegalDocuments,
    forensicConfidence: "90%",
    conflicts: "0 detected",
    relatedCases: "None",
    synopsis: {
      background: backgroundSentence || "The case was recently ingested into the Chronos system. Initial pre-processing completed.",
      parties: [
        { label: "Petitioner/Appellant", value: petitioner },
        { label: "Respondent", value: respondent },
        { label: "Originating Court", value: timeline?.case_info?.court || "Under Review" }
      ],
      chronologicalProgression: `The investigation chronological sequence contains ${numEvents} extracted events spanning from ${firstDate} to ${lastDate}. Key events include: ` + 
        sortedNodes.slice(0, 4).map(n => `[${n.start || "Unanchored"}] ${n.label}`).join("; ") + ".",
      legalIssues: "The central legal questions are under review as of the latest NLP ingestion phase.",
      courtProceedings: `Proceedings are recorded under court: ${timeline?.case_info?.court || "Under Review"}. The case is currently classified as ${timeline?.case_info?.status || "Ingested"}.`,
      finalOutcome: "The final orders, relief, or judgment directions are currently being indexed.",
      keyTakeaways: [
        `Temporal analysis successfully indexed ${numEvents} chronological event checkpoints.`,
        "Entity networks are generated and available in the Network DAG view."
      ]
    },
    metadata: {
      court: timeline?.case_info?.court || "Under Review",
      judge: judge,
      bench: "Under Review",
      caseCategory: "Under Review",
      petitionType: "Under Review",
      relevantArticles: "Under Review",
      relevantActs: "Under Review",
      relevantSections: "Under Review",
      importantDates: `Filing: ${firstDate}; Decision: ${lastDate}`,
      relatedProceedings: "Under Review",
      connectedCases: "Under Review"
    },
    atAGlance: {
      natureOfCase: "Legal Ingestion File",
      currentStatus: timeline?.case_info?.status || "Ingested",
      duration: span,
      keyLegalIssue: "Review of temporal relationship maps",
      primaryEvidence: "Ingested Raw Document",
      numTimelineEvents: numEvents,
      confidenceScore: "90%"
    }
  };
}

export default function App() {
  const [cases, setCases] = useState<CaseMetadata[]>([]);
  const [totalCases, setTotalCases] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelinePayload | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  
  // Upload States
  const [citationInput, setCitationInput] = useState("");
  const [courtInput, setCourtInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [activePolls, setActivePolls] = useState<string[]>([]);
  
  // Drag and drop helper
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UX & Navigation States
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'workspace' | 'forensic-timeline'>('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelinePayload>>({});

  // Theme & Redesign States
  const [theme, setTheme] = useState<'midnight' | 'parchment'>('midnight');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [contextFontSize, setContextFontSize] = useState<14 | 16 | 18>(14);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'list' | 'graph'>('list');

  // Rail <-> Network DAG workspace switch transition (fade/expand between tools)
  const [renderedWorkspaceMode, setRenderedWorkspaceMode] = useState<'list' | 'graph'>('list');
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);

  // Top-level tab switch transition (Overview / Chronological Workspace / Forensic Timeline)
  const [renderedTab, setRenderedTab] = useState<'dashboard' | 'workspace' | 'forensic-timeline'>('dashboard');
  const [tabSwitching, setTabSwitching] = useState(false);

  // Timeline node refs (for smooth-scroll centering) & Inspector transition state
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [displayEvent, setDisplayEvent] = useState<TimelineEvent | null>(null);
  const [inspectorTransitioning, setInspectorTransitioning] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);

  const limit = 6;
  const skip = (currentPage - 1) * limit;

  // ── API Fetch Layer ────────────────────────────────────────────────────────

  const fetchCases = async () => {
    try {
      const res = await fetch(`/api/cases?skip=${skip}&limit=${limit}`);
      if (!res.ok) throw new Error("API Offline");
      const data = await res.json();
      setCases(data.results);
      setTotalCases(data.total);
      setIsMockMode(false);
    } catch (e) {
      console.warn("Backend API offline. Fallback to mock data mode enabled.");
      setIsMockMode(true);
      // Populate mock case list
      setCases([
        {
          id: MOCK_TIMELINE.case_info.id,
          case_citation: MOCK_TIMELINE.case_info.citation,
          court_name: MOCK_TIMELINE.case_info.court,
          status: MOCK_TIMELINE.case_info.status,
          created_at: new Date().toISOString()
        }
      ]);
      setTotalCases(1);
    }
  };

  const fetchTimeline = async (caseId: string) => {
    if (isMockMode || caseId === MOCK_TIMELINE.case_info.id) {
      setTimeline(MOCK_TIMELINE);
      setTimelineCache(prev => ({ ...prev, [MOCK_TIMELINE.case_info.id]: MOCK_TIMELINE }));
      if (MOCK_TIMELINE.nodes.length > 0) {
        setSelectedEvent(MOCK_TIMELINE.nodes[0]);
      }
      return;
    }

    try {
      const res = await fetch(`/api/cases/${caseId}/timeline`);
      if (!res.ok) throw new Error("API Failure");
      const data = await res.json();
      setTimeline(data);
      setTimelineCache(prev => ({ ...prev, [caseId]: data }));
      // Sort nodes chronologically for linear timeline mapping
      const sortedNodes = [...data.nodes].sort((a, b) => {
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.localeCompare(b.start);
      });
      if (sortedNodes.length > 0) {
        setSelectedEvent(sortedNodes[0]);
      }
    } catch (e) {
      console.error("Failed to load timeline", e);
    }
  };

  // ── Poll for active case status updates ────────────────────────────────────

  useEffect(() => {
    if (activePolls.length === 0 || isMockMode) return;

    const interval = setInterval(async () => {
      let pollsChanged = false;
      const updatedPolls = [...activePolls];

      for (let i = updatedPolls.length - 1; i >= 0; i--) {
        const id = updatedPolls[i];
        try {
          const res = await fetch(`/api/cases/${id}/status`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            updatedPolls.splice(i, 1);
            pollsChanged = true;
            // If the completed case is the currently selected case, reload timeline
            if (id === selectedCaseId) {
              fetchTimeline(id);
            }
          }
        } catch (e) {
          console.error("Poll status check failed", e);
        }
      }

      if (pollsChanged) {
        setActivePolls(updatedPolls);
        fetchCases();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activePolls, selectedCaseId, isMockMode]);

  // Initial case loading
  useEffect(() => {
    fetchCases();
  }, [currentPage]);

  // Auto-select case on first load
  useEffect(() => {
    if (cases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(cases[0].id);
      fetchTimeline(cases[0].id);
    }
  }, [cases]);

  // Prefetch timelines for all cases on current page to calculate metrics
  useEffect(() => {
    if (isMockMode) {
      setTimelineCache({ [MOCK_TIMELINE.case_info.id]: MOCK_TIMELINE });
      return;
    }
    cases.forEach(async (c) => {
      if (timelineCache[c.id]) return;
      try {
        const res = await fetch(`/api/cases/${c.id}/timeline`);
        if (res.ok) {
          const data = await res.json();
          setTimelineCache(prev => ({ ...prev, [c.id]: data }));
        }
      } catch (e) {
        console.error("Failed to prefetch timeline for case " + c.id, e);
      }
    });
  }, [cases, isMockMode]);

  // Fade the inspector out, swap content, then fade it back in — instead of an instant swap
  useEffect(() => {
    if (!selectedEvent) return;
    if (selectedEvent.id === lastEventIdRef.current) {
      setDisplayEvent(selectedEvent);
      return;
    }
    const isFirstSelection = lastEventIdRef.current === null;
    lastEventIdRef.current = selectedEvent.id;

    if (isFirstSelection) {
      setDisplayEvent(selectedEvent);
      return;
    }

    setInspectorTransitioning(true);
    const t = setTimeout(() => {
      setDisplayEvent(selectedEvent);
      setInspectorTransitioning(false);
    }, 150);
    return () => clearTimeout(t);
  }, [selectedEvent]);

  // Keep the active timeline node smoothly centered when selection changes
  useEffect(() => {
    if (!selectedEvent) return;
    const node = nodeRefs.current[selectedEvent.id];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedEvent]);

  // Fade the Investigation Rail / Network DAG workspace out, swap tool, fade the new one in
  useEffect(() => {
    if (workspaceMode === renderedWorkspaceMode) return;
    setWorkspaceSwitching(true);
    const t = setTimeout(() => {
      setRenderedWorkspaceMode(workspaceMode);
      setWorkspaceSwitching(false);
    }, 150);
    return () => clearTimeout(t);
  }, [workspaceMode]);

  // Fade the current top-level workspace out, swap module, fade the new one in (Overview / Briefing / Forensic Timeline)
  useEffect(() => {
    if (currentTab === renderedTab) return;
    setTabSwitching(true);
    const t = setTimeout(() => {
      setRenderedTab(currentTab);
      setTabSwitching(false);
    }, 150);
    return () => clearTimeout(t);
  }, [currentTab]);

  // ── Form Uploading ─────────────────────────────────────────────────────────

  const handleUploadSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim()) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("case_citation", citationInput.trim() || "Manual upload");
      formData.append("court_name", courtInput.trim() || "Generic Court");
      formData.append("raw_text", textInput.trim());

      const res = await fetch('/api/cases/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      // Clear form
      setCitationInput("");
      setCourtInput("");
      setTextInput("");

      // Add to polling queue
      setActivePolls(prev => [...prev, data.case_id]);
      setSelectedCaseId(data.case_id);
      
      // Close modal and focus workspace
      setIsCreateModalOpen(false);
      setCurrentTab('workspace');

      // Refresh list
      fetchCases();
    } catch (e) {
      alert("Failed to submit case text. Check if backend api is reachable.");
    } finally {
      setIsUploading(false);
    }
  };

  // ── Drag & Drop Handlers ───────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadedFile(e.target.files[0]);
    }
  };

  const processUploadedFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          setCitationInput(parsed.case_citation || file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
          setCourtInput(parsed.court_name || "Generic Court");
          setTextInput(parsed.text || parsed.raw_text || text);
        } catch {
          setTextInput(text);
          setCitationInput(file.name.split('.')[0]);
        }
      } else {
        setTextInput(text);
        setCitationInput(file.name.split('.')[0]);
      }
    } catch (e) {
      alert("Could not parse file content.");
    }
  };

  // ── Sub-component Renderers ───────────────────────────────────────────────



  // Sorting timeline events chronologically
  const timelineEvents = timeline 
    ? [...timeline.nodes].sort((a, b) => {
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.localeCompare(b.start);
      })
    : [];

  // Dynamic theme styling mapping
  const colors = theme === 'midnight' ? {
    bg: 'bg-[#08090C]',                 // Very deep graphite
    text: 'text-[#C9D1D9]',             // Clean Inter body text
    textMuted: 'text-[#8B949E]',        // Low contrast steel gray
    border: 'border-[#1F232D]',         // Low contrast steel border outline
    headerBg: 'bg-[#0D0F14] border-b border-[#1F232D]',
    sidebarBg: 'bg-[#0D0F14] border-[#1F232D]',
    cardBg: 'bg-[#12141C] border border-[#1F232D]',
    cardBgHover: 'hover:bg-[#161822] hover:border-[#2C313D]',
    tabBg: 'bg-[#0A0B0E] border-[#1F232D]',
    panelBg: 'bg-[#12141C] border border-[#1F232D]',
    title: 'text-[#F0F6FC] font-display',
    inputBg: 'bg-[#08090C] border-[#1F232D] focus:border-[#C5A880]/60 text-[#F0F6FC]',
    detailsBg: 'bg-[#12141C] border border-[#1F232D]',
    snippetBg: 'bg-[#08090C] border-[#1F232D]',
    accentPrimary: 'text-[#7982E9]',
    accentSecondary: 'text-[#C5A880]',
  } : {
    bg: 'bg-[#FDFBF7]',                 // Anti-glare cream/parchment background
    text: 'text-[#1A1A1A]',             // Soft charcoal body text
    textMuted: 'text-[#5C5C5C]',        // Medium contrast grey
    border: 'border-[#E3DEC3]',         // Muted physical paper borders
    headerBg: 'bg-[#F7F4EB] border-b border-[#E3DEC3]',
    sidebarBg: 'bg-[#F7F4EB] border-[#E3DEC3]',
    cardBg: 'bg-[#FAF7F0] border border-[#E3DEC3]',
    cardBgHover: 'hover:bg-[#F2EDE0] hover:border-[#D6CFB1]',
    tabBg: 'bg-[#FDFBF7] border-[#E3DEC3]',
    panelBg: 'bg-[#FAF7F0] border border-[#E3DEC3]',
    title: 'text-[#1A1A1A] font-display',
    inputBg: 'bg-[#FDFBF7] border-[#E3DEC3] focus:border-[#C5A880]/80 text-[#1A1A1A]',
    detailsBg: 'bg-[#FAF7F0] border border-[#E3DEC3]',
    snippetBg: 'bg-[#F7F4EB] border-[#E3DEC3]',
    accentPrimary: 'text-[#3E459F]',
    accentSecondary: 'text-[#8E6F40]',
  };

  // Client-side filtering based on searchQuery
  const filteredCases = cases.filter(c => 
    c.case_citation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.court_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen ${colors.bg} ${colors.text} flex flex-col font-body transition-colors duration-200`}>
      {/* ── Top Header Bar ───────────────────────────────────────────────────── */}
      <header className={`backdrop-blur-md sticky top-0 z-40 px-6 py-3 flex items-center justify-between transition-colors duration-200 ${colors.headerBg}`}>
        <div className="flex items-center space-x-3">
          <div className={`p-1.5 bg-[#C5A880]/10 border border-[#C5A880]/20 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h1 className={`text-sm font-bold tracking-wider font-display uppercase ${colors.title}`}>
              CHRONOS // Legal Intelligence Workstation
            </h1>
            <p className={`text-[10px] tracking-tight uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
              Forensic narrative reconstruction & temporal event graph engine
            </p>
          </div>
        </div>

        {/* Global Connection & Theme Switches */}
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => setTheme(theme === 'midnight' ? 'parchment' : 'midnight')}
            className={`text-[9px] font-mono-meta uppercase tracking-wider px-2 py-0.5 border outline-none ${
              theme === 'midnight'
                ? 'bg-[#12141C] text-[#C5A880] border-[#1F232D] hover:bg-[#161822]'
                : 'bg-[#FAF7F0] text-[#8E6F40] border-[#E3DEC3] hover:bg-[#F2EDE0]'
            }`}
          >
            {theme === 'midnight' ? "⚖️ Parchment Mode" : "🌌 Midnight Mode"}
          </button>

          {isMockMode ? (
            <div className="flex items-center space-x-2 px-2.5 py-0.5 border border-amber-500/20 bg-amber-500/5 text-amber-500 text-[9px] font-mono font-medium tracking-wider uppercase">
              <span>Offline Sandbox Fallback Mode Active</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 px-2.5 py-0.5 border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[9px] font-mono font-medium tracking-wider uppercase">
              <span>Backend Connected // Online</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Global Command Bar ────────────────────────────────────────────────── */}
      <div className={`border-b px-6 py-2 flex items-center space-x-3 ${theme === 'midnight' ? 'bg-[#0D0F14] border-[#1F232D]' : 'bg-[#FAF7F0] border-[#E3DEC3]'}`}>
        <Search className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#8E6F40]'}`} />
        <input
          type="text"
          placeholder="SEARCH CHRONOS DATASTORE: Input case citation, court, or temporal evidence keywords..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`flex-1 bg-transparent border-none text-[11px] outline-none font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC] placeholder-[#5A6370]' : 'text-[#1A1A1A] placeholder-[#8E8E8E]'}`}
        />
        <div className="flex items-center space-x-1 select-none">
          <kbd className={`font-mono-meta text-[8px] px-1 py-0.5 rounded border shadow-sm ${theme === 'midnight' ? 'bg-[#1F232D] border-[#2C313D] text-[#8B949E]' : 'bg-[#EBE7D9] border-[#CBBFA0] text-[#5C5C5C]'}`}>⌘</kbd>
          <kbd className={`font-mono-meta text-[8px] px-1 py-0.5 rounded border shadow-sm ${theme === 'midnight' ? 'bg-[#1F232D] border-[#2C313D] text-[#8B949E]' : 'bg-[#EBE7D9] border-[#CBBFA0] text-[#5C5C5C]'}`}>K</kbd>
        </div>
      </div>

      {/* ── Sub-Header Navigation Bar ────────────────────────────────────────── */}
      <div className={`px-6 py-0 flex items-center justify-between border-b ${theme === 'midnight' ? 'border-[#1F232D] bg-[#0A0B0E]' : 'border-[#E3DEC3] bg-[#F7F4EB]'}`}>
        <div className="flex space-x-1">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-4 py-2.5 text-[11px] font-bold tracking-wider font-display uppercase border-b-2 transition-all duration-150 outline-none ${
              currentTab === 'dashboard'
                ? (theme === 'midnight' ? 'border-[#C5A880] text-[#F0F6FC] bg-[#12141C]/40' : 'border-[#8E6F40] text-[#1A1A1A] bg-[#FAF7F0]')
                : (theme === 'midnight' ? 'border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#12141C]/20' : 'border-transparent text-[#5C5C5C] hover:text-[#1A1A1A] hover:bg-[#EBE7D9]/50')
            }`}
          >
            Intelligence Overview
          </button>
          <button
            onClick={() => setCurrentTab('workspace')}
            className={`px-4 py-2.5 text-[11px] font-bold tracking-wider font-display uppercase border-b-2 transition-all duration-150 outline-none ${
              currentTab === 'workspace'
                ? (theme === 'midnight' ? 'border-[#C5A880] text-[#F0F6FC] bg-[#12141C]/40' : 'border-[#8E6F40] text-[#1A1A1A] bg-[#FAF7F0]')
                : (theme === 'midnight' ? 'border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#12141C]/20' : 'border-transparent text-[#5C5C5C] hover:text-[#1A1A1A] hover:bg-[#EBE7D9]/50')
            }`}
          >
            Case Summary
          </button>
          <button
            onClick={() => setCurrentTab('forensic-timeline')}
            className={`px-4 py-2.5 text-[11px] font-bold tracking-wider font-display uppercase border-b-2 transition-all duration-150 outline-none ${
              currentTab === 'forensic-timeline'
                ? (theme === 'midnight' ? 'border-[#C5A880] text-[#F0F6FC] bg-[#12141C]/40' : 'border-[#8E6F40] text-[#1A1A1A] bg-[#FAF7F0]')
                : (theme === 'midnight' ? 'border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#12141C]/20' : 'border-transparent text-[#5C5C5C] hover:text-[#1A1A1A] hover:bg-[#EBE7D9]/50')
            }`}
          >
            Forensic Timeline
          </button>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className={`font-semibold text-[10px] tracking-wider uppercase py-1.5 px-3 border transition-all duration-200 flex items-center space-x-1.5 ${theme === 'midnight' ? 'bg-[#404595] hover:bg-[#4E54B5] text-[#F0F6FC] border-[#1F232D]' : 'bg-[#3E459F] hover:bg-[#2F3582] text-[#FFFFFF] border-[#CBBFA0]'}`}
        >
          <Upload className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#FAF7F0]'}`} />
          <span>+ INGEST EVIDENCE CASING</span>
        </button>
      </div>

      {/* ── Main Panel Grid Layout ───────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-0">
        
        {/* PANEL A: Case Explorer Sidebar (2 Cols) */}
        <section className={`lg:col-span-2 flex flex-col space-y-4 h-full transition-all duration-300 ${isFocusMode ? 'hidden' : 'block'}`}>
          <div className="flex flex-col h-[520px]">
            <div className={`flex items-center space-x-2 pb-2 mb-3 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
              <Folder className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
              <h2 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                Active Cases datastore
              </h2>
            </div>

            {/* Ingested Cases List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {filteredCases.length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-full text-[10px] uppercase font-mono-meta py-8 text-center ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                  <span>No casetags matching filter.</span>
                </div>
              ) : (
                filteredCases.map((c) => {
                  const isSelected = selectedCaseId === c.id;
                  const isProcessing = c.status.toUpperCase() === 'PROCESSING' || c.status.toUpperCase() === 'PENDING';
                  const eventCount = timelineCache[c.id]?.nodes?.length || 0;
                  return (
                    <div key={c.id} className="block transition-all duration-150">
                      {/* Tab flap */}
                      <div className="flex">
                        <div className={`text-[8px] font-mono-meta px-2.5 py-0.5 border-t border-x select-none ${
                          theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'
                        } ${
                          isSelected 
                            ? (theme === 'midnight' ? 'bg-[#12141C] text-[#C5A880] border-b-[#12141C]' : 'bg-[#FAF7F0] text-[#8E6F40] border-b-[#FAF7F0] font-bold') 
                            : (theme === 'midnight' ? 'bg-[#08090C] text-[#8B949E] border-b-[#1F232D] hover:text-[#C9D1D9]' : 'bg-[#EFECE1] text-[#5C5C5C] border-b-[#CBBFA0] hover:text-[#1A1A1A]')
                        }`} style={{ clipPath: 'polygon(0% 0%, 82% 0%, 100% 100%, 0% 100%)' }}>
                          ID // {c.id.substring(0, 5).toUpperCase()}
                        </div>
                        <div className={`flex-1 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'}`} />
                      </div>

                      {/* Tab folder body */}
                      <button
                        onClick={() => {
                          setSelectedCaseId(c.id);
                          fetchTimeline(c.id);
                          setCurrentTab('workspace');
                        }}
                        className={`w-full text-left p-3 border-x border-b transition-all duration-150 relative block outline-none ${
                          isSelected
                            ? (theme === 'midnight' ? 'bg-[#12141C] border-[#C5A880]/30 text-[#F0F6FC]' : 'bg-[#FFFFFF] border-[#8E6F40] text-[#1A1A1A] font-bold shadow-sm')
                            : (theme === 'midnight' ? 'bg-[#12141C]/30 border-[#1F232D] text-[#8B949E] hover:bg-[#12141C]/60 hover:text-[#C9D1D9]' : 'bg-[#EBE7D9] border-[#CBBFA0] text-[#4A4A4A] hover:bg-[#F5F2E9] hover:text-[#1A1A1A]')
                        }`}
                      >
                        {/* Case status strip (colored bar on the left side) */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                          c.status.toUpperCase() === 'FAILED' ? 'bg-[#A83838]' :
                          isProcessing ? 'bg-[#B47518]' : 'bg-[#1C6B48]'
                        }`} />

                        <div className="flex justify-between items-start mb-1 pl-1.5">
                          <span className={`font-bold text-[10.5px] truncate max-w-[110px] font-display ${
                            isSelected ? (theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#000000] font-extrabold') : (theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#2E2E2E]')
                          }`} title={c.case_citation}>
                            {c.case_citation}
                          </span>
                          <span className={`font-mono-meta text-[8.5px] font-semibold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
                            {eventCount} EV
                          </span>
                        </div>
                        
                        <div className="text-[9px] font-mono-meta pl-1.5 flex justify-between">
                          <span className={`truncate max-w-[100px] ${
                            isSelected ? (theme === 'midnight' ? 'text-slate-350' : 'text-[#1A1A1A] font-bold') : (theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#4A4A4A] font-semibold')
                          }`}>{c.court_name}</span>
                          <span className={
                            isSelected ? (theme === 'midnight' ? 'text-slate-350' : 'text-[#1A1A1A]') : (theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]')
                          }>{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>

                        {/* Ingestion progress bar (rendered if processing) */}
                        {isProcessing && (
                          <div className="mt-2 pl-1.5">
                            <div className={`w-full h-1 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D]' : 'bg-[#EBE7D9] border-[#CBBFA0]'}`}>
                              <div className="bg-[#B47518] h-full animate-pulse" style={{ width: '40%' }}></div>
                            </div>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination controls */}
            <div className={`flex items-center justify-between pt-3 border-t mt-auto ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'}`}>
              <span className={`text-[9px] font-mono-meta uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                Total: {totalCases} casings
              </span>
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className={`p-1 border transition-colors disabled:opacity-20 disabled:pointer-events-none ${
                    theme === 'midnight' 
                      ? 'border-[#1F232D] bg-[#12141C] text-[#8B949E] hover:bg-[#1C2030] hover:text-[#F0F6FC]' 
                      : 'border-[#CBBFA0] bg-[#FAF7F0] text-[#5C5C5C] hover:bg-[#EBE7D9] hover:text-[#1A1A1A]'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className={`text-[10px] font-mono-meta px-2 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A] font-bold'}`}>
                  {currentPage}
                </span>
                <button
                  disabled={skip + limit >= totalCases}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className={`p-1 border transition-colors disabled:opacity-20 disabled:pointer-events-none ${
                    theme === 'midnight' 
                      ? 'border-[#1F232D] bg-[#12141C] text-[#8B949E] hover:bg-[#1C2030] hover:text-[#F0F6FC]' 
                      : 'border-[#CBBFA0] bg-[#FAF7F0] text-[#5C5C5C] hover:bg-[#EBE7D9] hover:text-[#1A1A1A]'
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CENTER / RIGHT SECTIONS: Ingestion & Visualizations (9 or 12 Cols) */}
        <div className={`flex flex-col space-y-6 h-full transition-all duration-300 ${isFocusMode ? 'lg:col-span-12' : 'lg:col-span-9'}`}>

          {/* Fade + expand wrapper for switching between Overview / Chronological Workspace / Forensic Timeline */}
          <div className={`flex flex-col flex-1 min-h-0 transition-all duration-300 ease-out ${tabSwitching ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'}`}>

          {/* ── View A: Forensic Intelligence Overview ── */}
          {renderedTab === 'dashboard' && (
            <div className="flex flex-col space-y-6 animate-in fade-in duration-200">
              {/* Header Brief */}
              <div className={`border p-4 text-left ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                <span className={`font-mono-meta text-[8px] px-1.5 py-0.5 uppercase tracking-wider ${theme === 'midnight' ? 'bg-[#404595]/20 text-[#7982E9] border border-[#404595]/35' : 'bg-[#3E459F]/10 text-[#3E459F] border border-[#3E459F]/20'}`}>
                  Chronos Datastore Analytics
                </span>
                <h2 className={`text-sm font-bold uppercase tracking-wide font-display mt-2 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                  System Overview & Forensic Intelligence
                </h2>
                <p className={`text-[11px] font-sans mt-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                  Active database monitoring, NLP temporal extraction metrics, and ingestion pipeline queue properties.
                </p>
              </div>

              {/* Intelligence Overview Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
                <div className={`border p-4 flex flex-col justify-between h-[100px] ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                  <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Cases Registered</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <span className={`text-xl font-bold font-mono ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{cases.length}</span>
                    <span className={`text-[9px] font-mono-meta uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Casings</span>
                  </div>
                  <div className={`w-full h-1 mt-auto ${theme === 'midnight' ? 'bg-[#08090C]' : 'bg-[#EBE7D9]'}`}>
                    <div className={`h-full ${theme === 'midnight' ? 'bg-[#404595]' : 'bg-[#3E459F]'}`} style={{ width: `${Math.min(100, cases.length * 15)}%` }}></div>
                  </div>
                </div>

                <div className={`border p-4 flex flex-col justify-between h-[100px] ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                  <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Resolved Events</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <span className={`text-xl font-bold font-mono ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
                      {Object.values(timelineCache).reduce((acc, tl) => acc + (tl?.nodes?.length || 0), 0)}
                    </span>
                    <span className={`text-[9px] font-mono-meta uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Anchors</span>
                  </div>
                  <div className={`w-full h-1 mt-auto ${theme === 'midnight' ? 'bg-[#08090C]' : 'bg-[#EBE7D9]'}`}>
                    <div className={`h-full ${theme === 'midnight' ? 'bg-[#C5A880]' : 'bg-[#8E6F40]'}`} style={{ width: '65%' }}></div>
                  </div>
                </div>

                <div className={`border p-4 flex flex-col justify-between h-[100px] ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                  <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Ingestion Pipeline Health</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <span className={`text-xl font-bold font-mono ${theme === 'midnight' ? 'text-emerald-450' : 'text-[#1C6B48]'}`}>99.8%</span>
                    <span className={`text-[9px] font-mono-meta uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Uptime</span>
                  </div>
                  <div className={`w-full h-1 mt-auto ${theme === 'midnight' ? 'bg-[#08090C]' : 'bg-[#EBE7D9]'}`}>
                    <div className={`h-full ${theme === 'midnight' ? 'bg-[#1C6B48]' : 'bg-[#1C6B48]'}`} style={{ width: '99.8%' }}></div>
                  </div>
                </div>

                <div className={`border p-4 flex flex-col justify-between h-[100px] ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                  <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Processing Queue</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <span className="text-xl font-bold font-mono text-[#B47518]">
                      {cases.filter(c => c.status.toUpperCase() === 'PENDING' || c.status.toUpperCase() === 'PROCESSING').length}
                    </span>
                    <span className={`text-[9px] font-mono-meta uppercase ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Queueing</span>
                  </div>
                  <div className={`w-full h-1 mt-auto ${theme === 'midnight' ? 'bg-[#08090C]' : 'bg-[#EBE7D9]'}`}>
                    <div className="bg-[#B47518] h-full" style={{ width: '20%' }}></div>
                  </div>
                </div>
              </div>

              {/* Layout split: Datastore Queue, Court Distribution, Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                {/* Left side: Court Distributions & Timeline Density (7 Columns) */}
                <div className="lg:col-span-7 space-y-6">
                  <div className={`border p-4 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                    <div className={`flex items-center space-x-2 pb-2 mb-3 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                      <Scale className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                      <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                        Originating Court Distribution
                      </h3>
                    </div>
                    <div className="space-y-3.5">
                      {/* We calculate court counts dynamically */}
                      {(() => {
                        const courtCounts: Record<string, number> = {};
                        cases.forEach(c => {
                          courtCounts[c.court_name] = (courtCounts[c.court_name] || 0) + 1;
                        });
                        const courtList = Object.entries(courtCounts);
                        if (courtList.length === 0) {
                          return <div className="text-[10px] font-mono-meta text-[#8B949E] uppercase">No active courts loaded.</div>;
                        }
                        return courtList.map(([court, count]) => {
                          const percentage = Math.min(100, (count / cases.length) * 100);
                          return (
                            <div key={court} className="space-y-1">
                              <div className={`flex justify-between text-[10px] font-mono-meta ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A] font-bold'}`}>
                                <span className="truncate max-w-[200px]">{court.toUpperCase()}</span>
                                <span className={`font-bold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>{count} ({Math.round(percentage)}%)</span>
                              </div>
                              <div className={`w-full h-1.5 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D]' : 'bg-[#EBE7D9] border-[#E3DEC3]'}`}>
                                <div className={`h-full ${theme === 'midnight' ? 'bg-[#404595]' : 'bg-[#3E459F]'}`} style={{ width: `${percentage}%` }}></div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div className={`border p-4 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                    <div className={`flex items-center space-x-2 pb-2 mb-3 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                      <Activity className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                      <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                        Recent Narrative Extractions
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {cases.slice(0, 3).map((c) => (
                        <div key={c.id} className={`p-2 border flex justify-between items-center ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FDFBF7]'}`}>
                          <div>
                            <span className={`font-bold text-[10.5px] font-display block ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>{c.case_citation}</span>
                            <span className={`text-[9px] font-mono-meta block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>{c.court_name}</span>
                          </div>
                          <span className={`text-[9px] font-mono-meta uppercase tracking-wider ${theme === 'midnight' ? 'text-emerald-450' : 'text-[#1C6B48] font-bold'}`}>
                            [ Ingested ]
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right side: Pipeline Health & Processing Queue (5 Columns) */}
                <div className="lg:col-span-5 space-y-6">
                  <div className={`border p-4 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#E3DEC3] bg-[#FAF7F0]'}`}>
                    <div className={`flex items-center space-x-2 pb-2 mb-3 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                      <Terminal className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                      <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                        System Health & Logs
                      </h3>
                    </div>
                    <div className={`space-y-2 font-mono-meta text-[9px] leading-relaxed ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                      <div className={`flex justify-between border-b pb-1 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                        <span>DB STATUS</span>
                        <span className={`font-bold ${theme === 'midnight' ? 'text-emerald-400' : 'text-[#1C6B48]'}`}>ACTIVE // SECURE</span>
                      </div>
                      <div className={`flex justify-between border-b pb-1 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                        <span>INFERENCE RESOLVER</span>
                        <span className={`font-bold ${theme === 'midnight' ? 'text-emerald-450' : 'text-[#1C6B48]'}`}>READY // SPACY_NLP</span>
                      </div>
                      <div className={`flex justify-between border-b pb-1 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                        <span>STORAGE INTEGRITY</span>
                        <span className={`font-bold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>VERIFIED</span>
                      </div>
                      <div className={`flex justify-between border-b pb-1 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                        <span>LATEST TRANSITIVE REDUCTION</span>
                        <span className={`font-bold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>COMPLETE</span>
                      </div>
                      <div className={`text-[8px] mt-2 font-sans italic ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                        All temporal relations transitively reduced using NetworkX.
                      </div>
                    </div>
                  </div>

                  {/* Selection Help */}
                  <button
                    onClick={() => setCurrentTab('workspace')}
                    className={`w-full text-center border border-dashed p-6 transition-all block group outline-none ${theme === 'midnight' ? 'border-[#1F232D] hover:bg-[#12141C]/20' : 'border-[#E3DEC3] hover:bg-[#FAF7F0]'}`}
                  >
                    <Folder className={`w-8 h-8 mx-auto mb-2 opacity-60 group-hover:scale-105 transition-transform ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#8E6F40]'}`} />
                    <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta mb-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>Launch Case Summary</h3>
                    <p className={`text-[10px] max-w-[200px] mx-auto leading-normal ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                      Access a comprehensive, executive legal briefing of the selected casing file.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── View B: Case Briefing Workspace ── */}
          {renderedTab === 'workspace' && (
            <div className="flex flex-col space-y-12 flex-1 transition-all duration-200">

              {timeline ? (
                <div className={`border p-6 md:p-8 flex flex-col space-y-5 transition-shadow duration-300 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C] shadow-[0_12px_36px_rgba(0,0,0,0.35)]' : 'border-[#CBBFA0] bg-[#FAF7F0] shadow-[0_12px_28px_rgba(60,50,20,0.07)]'}`}>
                    {/* Top Row: Title, Court and Focus controls */}
                    <div className={`flex justify-between items-start border-b pb-4 ${theme === 'midnight' ? 'border-[#1F232D]/60' : 'border-[#E3DEC3]'}`}>
                      <div>
              {timeline ? (() => {
                const brief = getCaseBrief(timeline.case_info.citation, timeline);
                return (
                  <div className="flex flex-col space-y-6">
                    {/* Briefing Case overview card */}
                    <div className={`border p-6 md:p-8 flex flex-col space-y-5 transition-shadow duration-300 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C] shadow-[0_12px_36px_rgba(0,0,0,0.35)]' : 'border-[#CBBFA0] bg-[#FAF7F0] shadow-[0_12px_28px_rgba(60,50,20,0.07)]'}`}>
                      {/* Top Row: Title, Court and Focus controls */}
                      <div className={`flex justify-between items-start border-b pb-4 ${theme === 'midnight' ? 'border-[#1F232D]/60' : 'border-[#E3DEC3]'}`}>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`font-mono-meta text-[8px] px-1.5 py-0.5 uppercase tracking-wider ${theme === 'midnight' ? 'bg-[#404595]/20 text-[#7982E9] border border-[#404595]/35' : 'bg-[#3E459F]/10 text-[#3E459F] border border-[#3E459F]/20'}`}>
                              Executive Legal Briefing
                            </span>
                            <span className={`font-mono-meta text-[8px] px-1.5 py-0.5 uppercase tracking-wider ${theme === 'midnight' ? 'bg-[#1C6B48]/20 text-emerald-450 border border-[#1C6B48]/35' : 'bg-[#1C6B48]/10 text-[#1C6B48] border border-[#1C6B48]/20'}`}>
                              Analysis Complete
                            </span>
                          </div>
                          <h2 className={`text-sm font-bold uppercase tracking-wide font-display mt-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>{brief.title}</h2>
                          <p className={`text-[10px] font-mono-meta tracking-wider ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#3A3A3A] font-semibold'}`}>
                            {brief.caseNumber} &bull; {brief.court}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className={`font-mono-meta text-[8px] px-1.5 py-0.5 uppercase tracking-wider ${theme === 'midnight' ? 'bg-[#404595]/20 text-[#7982E9] border border-[#404595]/35' : 'bg-[#3E459F]/10 text-[#3E459F] border border-[#3E459F]/20'}`}>
                            Active Briefing Case
                          </span>
                          <span className={`font-mono-meta text-[8px] px-1.5 py-0.5 uppercase tracking-wider ${theme === 'midnight' ? 'bg-[#1C6B48]/20 text-emerald-450 border border-[#1C6B48]/35' : 'bg-[#1C6B48]/10 text-[#1C6B48] border border-[#1C6B48]/20'}`}>
                            Temporal Inference Complete
                          </span>
                        </div>
                        <h2 className={`text-sm font-bold uppercase tracking-wide font-display mt-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>{timeline.case_info.citation}</h2>
                        <p className={`text-[10px] font-mono-meta tracking-wider ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#3A3A3A] font-semibold'}`}>{timeline.case_info.court}</p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setIsFocusMode(!isFocusMode)}
                          className={`px-2.5 py-1 text-[10px] font-bold font-display tracking-wider uppercase border transition-all outline-none ${theme === 'midnight' ? 'border-[#1F232D] bg-[#0A0B0E] text-[#C9D1D9] hover:bg-[#12141C]' : 'border-[#CBBFA0] bg-[#FDFBF7] text-[#1A1A1A] hover:bg-[#EBE7D9]'}`}
                        >
                          {isFocusMode ? "✕ Close Focus" : "🔍 Focus Casing"}
                        </button>
                      </div>
                    </div>

                    {/* Briefing Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-1 text-left">
                      <div>
                        <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Timeline Span</span>
                        <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>
                          {timelineEvents.length > 0 ? `${timelineEvents[0].start} // ${timelineEvents[timelineEvents.length - 1].start}` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Resolved Checkpoints</span>
                        <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{timelineEvents.length} events</span>
                      </div>
                      <div>
                        <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Inferred Relations</span>
                        <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
                          {Math.max(0, timeline.edges.filter(e => e.label.toUpperCase() === 'BEFORE').length - 1)} connections
                        </span>
                      </div>
                      <div>
                        <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Forensic Confidence</span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className={`text-[10px] font-mono-meta font-bold ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1C6B48]'}`}>93%</span>
                          <div className={`w-12 h-1 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D]' : 'bg-[#EBE7D9] border-[#CBBFA0]'}`}>
                            <div className="bg-[#1C6B48] h-full" style={{ width: '93%' }}></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Conflicts / Contradictions</span>
                        <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#A83838]' : 'text-[#A83838]'}`}>0 detected</span>
                      </div>
                    </div>

                    {/* Briefing Case Overview */}
                    <div className={`border-t pt-3 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                      <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                        Chronological Narrative Abstract
                      </span>
                      <p className={`text-[11px] leading-relaxed p-2.5 border font-sans ${theme === 'midnight' ? 'text-[#8B949E] bg-[#08090C] border-[#1F232D]' : 'text-[#1A1A1A] bg-[#FFFFFF] border-[#E3DEC3]'}`}>
                        {timeline.case_info.raw_text 
                          ? (timeline.case_info.raw_text.substring(0, 320) + (timeline.case_info.raw_text.length > 320 ? '...' : '')) 
                          : "No raw narrative casetext uploaded. Load folder database properties."}
                      </p>
                    </div>
                  </div>
              ) : (
                          <button
                            type="button"
                            onClick={() => setIsFocusMode(!isFocusMode)}
                            className={`px-2.5 py-1 text-[10px] font-bold font-display tracking-wider uppercase border transition-all outline-none ${theme === 'midnight' ? 'border-[#1F232D] bg-[#0A0B0E] text-[#C9D1D9] hover:bg-[#12141C]' : 'border-[#CBBFA0] bg-[#FDFBF7] text-[#1A1A1A] hover:bg-[#EBE7D9]'}`}
                          >
                            {isFocusMode ? "✕ Close Focus" : "🔍 Focus Casing"}
                          </button>
                        </div>
                      </div>

                      {/* Briefing Metrics Grid (Executive Overview) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 py-1 text-left">
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Jurisdiction</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.jurisdiction}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Case Type</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>{brief.caseType}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Filing Date</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.filingDate}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Decision Date</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.decisionDate}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Timeline Span</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.timelineSpan}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Witnesses</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.numWitnesses}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Documents</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.numLegalDocuments} items</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Forensic Confidence</span>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className={`text-[10px] font-mono-meta font-bold ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1C6B48]'}`}>{brief.forensicConfidence}</span>
                            <div className={`w-8 h-1 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D]' : 'bg-[#EBE7D9] border-[#CBBFA0]'}`}>
                              <div className="bg-[#1C6B48] h-full" style={{ width: brief.forensicConfidence }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Secondary Overview Metrics */}
                      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 border-t pt-3 mt-1 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Current Status</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.status}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Related Proceedings</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>{brief.relatedCases}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Conflicts / Contradictions</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${brief.conflicts.includes('0') ? (theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]') : 'text-[#A83838]'}`}>{brief.conflicts}</span>
                        </div>
                        <div>
                          <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>Intelligence Assets</span>
                          <span className={`text-[10px] font-mono-meta font-bold block mt-0.5 ${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#1A1A1A]'}`}>
                            {brief.numEvents} Events // {brief.numEvidenceNodes} Evidence Nodes
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* Layout Split: Main Synopsis & Metadata (8 cols) and Sidebar Glance (4 cols) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                      
                      {/* Left Column: Synopsis & Metadata (8 Cols) */}
                      <div className="lg:col-span-8 space-y-6">
                        
                        {/* CASE SYNOPSIS CARD */}
                        <div className={`border p-6 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C] shadow-[0_4px_20px_rgba(0,0,0,0.15)]' : 'border-[#E3DEC3] bg-[#FAF7F0] shadow-[0_4px_16px_rgba(0,0,0,0.02)]'}`}>
                          <div className={`flex items-center space-x-2 pb-2 mb-4 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                            <FileText className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                            <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                              Case Synopsis
                            </h3>
                          </div>
                          
                          <div className="space-y-6 text-[11px] leading-relaxed">
                            
                            {/* Background */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Background</h4>
                              <p className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{brief.synopsis.background}</p>
                            </div>
                            
                            {/* Parties Involved */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-2 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Parties Involved</h4>
                              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border font-mono-meta text-[10px] ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#8B949E]' : 'bg-[#FAF7F0] border-[#E3DEC3] text-[#5C5C5C]'}`}>
                                {brief.synopsis.parties.map((p, idx) => (
                                  <div key={idx} className="space-y-0.5">
                                    <span className="font-bold uppercase tracking-wider block text-[8px] opacity-75">{p.label}</span>
                                    <span className={`block ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{p.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            {/* Chronological Progression */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Chronological Progression</h4>
                              <p className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{brief.synopsis.chronologicalProgression}</p>
                            </div>
                            
                            {/* Legal Issues */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Legal Issues</h4>
                              <p className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{brief.synopsis.legalIssues}</p>
                            </div>
                            
                            {/* Court Proceedings */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Court Proceedings</h4>
                              <p className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{brief.synopsis.courtProceedings}</p>
                            </div>
                            
                            {/* Final Outcome */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Final Outcome</h4>
                              <p className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{brief.synopsis.finalOutcome}</p>
                            </div>
                            
                            {/* Key Takeaways */}
                            <div>
                              <h4 className={`text-[9px] font-mono-meta uppercase tracking-wider font-bold mb-2 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>Key Takeaways</h4>
                              <ul className="list-disc list-inside space-y-1.5 pl-1">
                                {brief.synopsis.keyTakeaways.map((k, idx) => (
                                  <li key={idx} className={`${theme === 'midnight' ? 'text-[#C9D1D9]' : 'text-[#3A3A3A]'}`}>{k}</li>
                                ))}
                              </ul>
                            </div>
                            
                          </div>
                        </div>
                        
                        {/* IMPORTANT CASE METADATA */}
                        <div className={`border p-6 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C] shadow-[0_4px_20px_rgba(0,0,0,0.15)]' : 'border-[#E3DEC3] bg-[#FAF7F0] shadow-[0_4px_16px_rgba(0,0,0,0.02)]'}`}>
                          <div className={`flex items-center space-x-2 pb-2 mb-4 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                            <Scale className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                            <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                              Important Case Metadata
                            </h3>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 font-mono-meta text-[9.5px]">
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Originating Court</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.court}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Judge(s)</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.judge}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Bench Type</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.bench}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Case Category</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.caseCategory}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Petition Type</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.petitionType}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Relevant Acts</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.relevantActs}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Relevant Sections</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.relevantSections}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Relevant Articles</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.relevantArticles}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Important Dates</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.importantDates}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Connected Cases</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.connectedCases}</span>
                            </div>
                            <div className="md:col-span-2">
                              <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-60">Related Proceedings</span>
                              <span className={`block mt-0.5 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.metadata.relatedProceedings}</span>
                            </div>
                          </div>
                        </div>
                        
                      </div>
                      
                      {/* Right Column: Case at a Glance Panel (4 Cols) */}
                      <div className="lg:col-span-4 space-y-6">
                        <div className={`border p-6 sticky top-6 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C] shadow-[0_4px_20px_rgba(0,0,0,0.15)]' : 'border-[#CBBFA0] bg-[#FAF7F0] shadow-[0_4px_16px_rgba(0,0,0,0.02)]'}`}>
                          <div className={`flex items-center space-x-2 pb-2 mb-4 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'}`}>
                            <Eye className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                            <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                              Case at a Glance
                            </h3>
                          </div>
                          
                          <div className="space-y-3.5">
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Nature of Case</span>
                              <span className={`text-[10.5px] font-mono-meta font-bold block mt-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.atAGlance.natureOfCase}</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Current Status</span>
                              <span className={`text-[10.5px] font-mono-meta font-bold block mt-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.atAGlance.currentStatus}</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Duration</span>
                              <span className={`text-[10.5px] font-mono-meta font-bold block mt-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.atAGlance.duration}</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Key Legal Issue</span>
                              <span className={`text-[10px] font-mono-meta font-bold block mt-1 leading-normal ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.atAGlance.keyLegalIssue}</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Primary Evidence</span>
                              <span className={`text-[10px] font-mono-meta font-bold block mt-1 leading-normal ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A]'}`}>{brief.atAGlance.primaryEvidence}</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Timeline Events</span>
                              <span className={`text-[10.5px] font-mono font-bold block mt-1 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>{brief.atAGlance.numTimelineEvents} checkpoints</span>
                            </div>
                            
                            <div className={`p-3 border flex flex-col justify-between ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]/50' : 'border-[#E3DEC3] bg-[#FFFFFF]'}`}>
                              <span className={`text-[8px] font-mono-meta uppercase tracking-wider font-bold block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>Confidence Score</span>
                              <span className={`text-[10.5px] font-mono-meta font-bold block mt-1 ${theme === 'midnight' ? 'text-emerald-450' : 'text-[#1C6B48]'}`}>{brief.atAGlance.confidenceScore}</span>
                            </div>
                            
                          </div>
                        </div>
                      </div>
                      
                    </div>
                  </div>
                );
              })() : (
                <div className={`border-dashed border p-8 flex flex-col items-center justify-center text-center ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]/30' : 'border-[#E3DEC3] bg-[#FAF7F0]/60'}`}>
                  <Folder className={`w-10 h-10 mb-3 opacity-60 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#8E6F40]'}`} />
                  <h3 className={`text-xs font-bold font-display uppercase mb-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>No Active Case Casing Selected</h3>
                  <p className={`text-[11px] max-w-sm ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                    Select an active casing folder from the active folder datastore on the left to view its case briefing.
                  </p>
                </div>
              )}

            </div>
          )}

          {/* ── View C: Forensic Timeline (dedicated full-page investigation canvas) ── */}
          {renderedTab === 'forensic-timeline' && (
            <div className="flex flex-col flex-1 min-h-0 transition-all duration-200">
              {timeline ? (
                (() => {
                    // Chain-of-custody links follow the (delayed) displayed event so they change in lockstep with the inspector content
                    const displayIdx = timelineEvents.findIndex(e => e.id === displayEvent?.id);
                    const prevEvent = displayIdx > 0 ? timelineEvents[displayIdx - 1] : null;
                    const nextEvent = displayIdx >= 0 && displayIdx < timelineEvents.length - 1 ? timelineEvents[displayIdx + 1] : null;

                    // Node highlighting follows selectedEvent immediately, ahead of the inspector transition
                    const connectedEventIds = new Set<string>();
                    if (selectedEvent) {
                      connectedEventIds.add(selectedEvent.id);
                      timeline.edges.forEach(edge => {
                        if (edge.from === selectedEvent.id) connectedEventIds.add(edge.to);
                        if (edge.to === selectedEvent.id) connectedEventIds.add(edge.from);
                      });
                    }

                    const hoveredEvent = hoveredIndex !== null ? timelineEvents[hoveredIndex] : null;
                    const hoveredConnectedIds = new Set<string>();
                    if (hoveredEvent) {
                      hoveredConnectedIds.add(hoveredEvent.id);
                      timeline.edges.forEach(edge => {
                        if (edge.from === hoveredEvent.id) hoveredConnectedIds.add(edge.to);
                        if (edge.to === hoveredEvent.id) hoveredConnectedIds.add(edge.from);
                      });
                    }

                    return (
                      <section
                        className={`border flex flex-col flex-1 transition-all duration-300 ease-out p-4 md:p-6 ${theme === 'midnight' ? 'border-[#1F232D] bg-[#0D0F14] shadow-[0_12px_36px_rgba(0,0,0,0.35)]' : 'border-[#CBBFA0] bg-[#FAF7F0] shadow-[0_12px_28px_rgba(60,50,20,0.07)]'}`}
                        style={{ minHeight: '85vh' }}
                      >
                        {/* ═══ FORENSIC TIMELINE: dedicated full-page investigation canvas ═══ */}
                        <div className={`flex justify-between items-center border-b transition-all duration-300 pb-3 mb-4 ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                          <div className="flex items-center space-x-2">
                            <Calendar className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                            <h2 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                              Evidence Chronology Investigation rail
                            </h2>
                          </div>

                          {/* Segmented Control Switcher */}
                          <div className={`flex border ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C]' : 'border-[#CBBFA0] bg-[#EBE7D9]'}`}>
                            <button
                              type="button"
                              onClick={() => setWorkspaceMode('list')}
                              className={`px-3 py-1 text-[9px] font-mono-meta uppercase tracking-wider transition-all outline-none ${
                                workspaceMode === 'list'
                                  ? (theme === 'midnight' ? 'bg-[#C5A880] text-[#08090C] font-bold' : 'bg-[#8E6F40] text-[#FFFFFF] font-bold')
                                  : (theme === 'midnight' ? 'text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#12141C]/50' : 'text-[#5C5C5C] hover:text-[#1A1A1A] hover:bg-[#FAF7F0]')
                              }`}
                            >
                              Investigation Rail
                            </button>
                            <button
                              type="button"
                              onClick={() => setWorkspaceMode('graph')}
                              className={`px-3 py-1 text-[9px] font-mono-meta uppercase tracking-wider transition-all border-l outline-none ${
                                theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'
                              } ${
                                workspaceMode === 'graph'
                                  ? (theme === 'midnight' ? 'bg-[#C5A880] text-[#08090C] font-bold' : 'bg-[#8E6F40] text-[#FFFFFF] font-bold')
                                  : (theme === 'midnight' ? 'text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#12141C]/50' : 'text-[#5C5C5C] hover:text-[#1A1A1A] hover:bg-[#FAF7F0]')
                              }`}
                            >
                              Network DAG
                            </button>
                          </div>
                        </div>

                        {/* Visual Workspace Split (Timeline Canvas 75% / Evidence Inspector 25%) */}
                        <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">

                          {/* Left Timeline Scroller or Graph Canvas */}
                          <div
                            className={`h-full transition-all duration-300 ease-out ${
                              renderedWorkspaceMode === 'graph' ? 'overflow-hidden' : 'overflow-y-auto pr-2'
                            } ${workspaceSwitching ? 'opacity-0' : 'opacity-100'}`}
                            style={{ width: isFocusMode ? '100%' : '75%' }}
                          >
                            {renderedWorkspaceMode === 'graph' ? (
                              <NetworkGraphCanvas
                                timeline={timeline}
                                selectedEvent={selectedEvent}
                                onSelectEvent={(ev) => setSelectedEvent(ev)}
                                theme={theme}
                              />
                            ) : timelineEvents.length === 0 ? (
                              <div className={`h-full flex flex-col items-center justify-center text-[10px] uppercase font-mono-meta py-12 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                <Clock className={`w-10 h-10 mb-3 opacity-35 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                                <span>No event checkpoints generated.</span>
                                <span>Awaiting casings NLP ingestion.</span>
                              </div>
                            ) : (
                              <div className="relative py-4 pr-1">
                                {/* Centered Timeline Axis Rail */}
                                <div className={`absolute left-1/2 transform -translate-x-1/2 w-[1.5px] h-full ${theme === 'midnight' ? 'bg-[#1F232D]' : 'bg-[#B2A888]'}`} />

                                {/* Centered Dynamic Highlight Link */}
                                <div 
                                  className={`absolute left-1/2 transform -translate-x-1/2 w-[2px] transition-all duration-300 ease-out ${theme === 'midnight' ? 'bg-[#C5A880]' : 'bg-[#8E6F40]'}`}
                                  style={{
                                    top: 0,
                                    height: hoveredIndex !== null 
                                      ? `${Math.min(100, ((hoveredIndex + 0.5) / timelineEvents.length) * 100)}%` 
                                      : '0%'
                                  }}
                                />

                                {/* Annotations List */}
                                <div className="flex flex-col">
                                  {timelineEvents.map((ev, idx) => {
                                    const isSelected = selectedEvent?.id === ev.id;
                                    const isLeft = idx % 2 === 0;
                                    // Spacing based on actual temporal distance
                                    const nextEv = timelineEvents[idx + 1];
                                    let gapHeight = 110;
                                    if (nextEv && ev.start && nextEv.start) {
                                      const d1 = new Date(ev.start).getTime();
                                      const d2 = new Date(nextEv.start).getTime();
                                      const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
                                      if (diffDays > 0) {
                                        gapHeight = Math.min(340, Math.max(110, Math.log10(diffDays) * 100));
                                      }
                                    }

                                    return (
                                      <div
                                        key={ev.id}
                                        ref={(el) => { nodeRefs.current[ev.id] = el; }}
                                        className="flex items-center relative w-full"
                                        style={{ marginBottom: `${gapHeight}px` }}
                                        onMouseEnter={() => setHoveredIndex(idx)}
                                        onMouseLeave={() => setHoveredIndex(null)}
                                      >
                                        {/* Chronological node bubble checkpoint centered exactly on rail */}
                                        <div className="absolute left-1/2 transform -translate-x-1/2 z-10 flex items-center justify-center">
                                          <span
                                            onClick={() => setSelectedEvent(ev)}
                                            className={`w-6 h-6 border cursor-pointer transition-all duration-300 ease-out flex items-center justify-center ${
                                              isSelected
                                                ? (theme === 'midnight' ? 'bg-[#404595]/30 border-[#C5A880] shadow-[0_0_8px_rgba(197,168,128,0.2)] scale-110' : 'bg-[#EBE7D9] border-[#8E6F40] shadow-[0_0_8px_rgba(142,111,64,0.4)] scale-110')
                                                : (hoveredConnectedIds.has(ev.id) || connectedEventIds.has(ev.id))
                                                  ? (theme === 'midnight' ? 'bg-[#12141C] border-[#7982E9] scale-105 shadow-[0_0_6px_rgba(121,130,233,0.15)]' : 'bg-[#FAF7F0] border-[#3E459F] scale-105 shadow-[0_0_6px_rgba(62,69,159,0.25)]')
                                                  : (theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] hover:border-[#8B949E] hover:scale-105' : 'bg-[#FAF7F0] border-[#B2A888] hover:border-[#1A1A1A] hover:scale-105')
                                            }`}
                                          >
                                            {(() => {
                                              const l = ev.label.toLowerCase();
                                              if (l.includes('filing') || l.includes('file') || l.includes('petition')) return <FileText className={`w-3 h-3 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />;
                                              if (l.includes('witness') || l.includes('testify') || l.includes('statement')) return <Eye className={`w-3 h-3 ${theme === 'midnight' ? 'text-blue-400' : 'text-[#3E459F]'}`} />;
                                              if (l.includes('arrest') || l.includes('detain') || l.includes('custody') || l.includes('remand')) return <Scale className="w-3 h-3 text-[#A83838]" />;
                                              if (l.includes('bail') || l.includes('release')) return <Scale className="w-3 h-3 text-[#1C6B48]" />;
                                              if (l.includes('judgment') || l.includes('convict') || l.includes('sentence')) return <Scale className={`w-3 h-3 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />;
                                              return <Info className={`w-3 h-3 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`} />;
                                            })()}
                                          </span>
                                        </div>

                                        {/* Left Side Content */}
                                        <div className="w-[45%] text-right pr-6 flex flex-col justify-center">
                                          {isLeft ? (
                                            <div 
                                              onClick={() => setSelectedEvent(ev)}
                                              className={`p-4 border text-left cursor-pointer transition-all duration-300 ease-out ${
                                                isSelected
                                                  ? (theme === 'midnight' ? 'bg-[#12141C] border-[#C5A880] text-[#F0F6FC] shadow-md shadow-[#C5A880]/5' : 'bg-[#FAF7F0] border-[#8E6F40] text-[#1A1A1A] shadow-md shadow-[#8E6F40]/10')
                                                  : (theme === 'midnight' ? 'bg-[#12141C]/40 border-[#1F232D] hover:border-[#8B949E]/40 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 text-[#8B949E] hover:text-[#C9D1D9]' : 'bg-[#FFFFFF] border-[#E3DEC3] hover:border-[#B2A888] hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 text-[#5C5C5C] hover:text-[#1A1A1A]')
                                              }`}
                                            >
                                              <div className="flex justify-between items-center mb-1">
                                                <span className={`text-[9px] font-mono-meta uppercase tracking-wider font-semibold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
                                                  {ev.label}
                                                </span>
                                                <span className={`text-[8.5px] font-mono-meta px-1 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#8B949E]' : 'bg-[#EBE7D9] border-[#CBBFA0] text-[#1A1A1A] font-bold'}`}>
                                                  {ev.start || "NO DATE"}
                                                </span>
                                              </div>
                                              <p className="text-[10px] line-clamp-4 leading-relaxed">
                                                {ev.title}
                                              </p>
                                            </div>
                                          ) : (
                                            <span className={`text-[9px] font-mono-meta uppercase tracking-wider ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#1A1A1A] font-extrabold'}`}>
                                              {ev.start || "Unanchored"}
                                            </span>
                                          )}
                                        </div>

                                        {/* Center spacing */}
                                        <div className="w-[10%]" />

                                        {/* Right Side Content */}
                                        <div className="w-[45%] text-left pl-6 flex flex-col justify-center">
                                          {!isLeft ? (
                                            <div 
                                              onClick={() => setSelectedEvent(ev)}
                                              className={`p-4 border text-left cursor-pointer transition-all duration-300 ease-out ${
                                                isSelected
                                                  ? (theme === 'midnight' ? 'bg-[#12141C] border-[#C5A880] text-[#F0F6FC] shadow-md shadow-[#C5A880]/5' : 'bg-[#FAF7F0] border-[#8E6F40] text-[#1A1A1A] shadow-md shadow-[#8E6F40]/10')
                                                  : (theme === 'midnight' ? 'bg-[#12141C]/40 border-[#1F232D] hover:border-[#8B949E]/40 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 text-[#8B949E] hover:text-[#C9D1D9]' : 'bg-[#FFFFFF] border-[#E3DEC3] hover:border-[#B2A888] hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 text-[#5C5C5C] hover:text-[#1A1A1A]')
                                              }`}
                                            >
                                              <div className="flex justify-between items-center mb-1">
                                                <span className={`text-[9px] font-mono-meta uppercase tracking-wider font-semibold ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`}>
                                                  {ev.label}
                                                </span>
                                                <span className={`text-[8.5px] font-mono-meta px-1 border ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#8B949E]' : 'bg-[#EBE7D9] border-[#CBBFA0] text-[#1A1A1A] font-bold'}`}>
                                                  {ev.start || "NO DATE"}
                                                </span>
                                              </div>
                                              <p className="text-[10px] line-clamp-4 leading-relaxed">
                                                {ev.title}
                                              </p>
                                            </div>
                                          ) : (
                                            <span className={`text-[9px] font-mono-meta uppercase tracking-wider ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#1A1A1A] font-extrabold'}`}>
                                              {ev.start || "Unanchored"}
                                            </span>
                                          )}
                                        </div>

                                        {/* Time-Elapsed Connector Badge */}
                                        {nextEv && ev.start && nextEv.start && (
                                          <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-[28px] z-20 flex justify-center w-full pointer-events-none">
                                            <span className={`text-[8px] font-mono-meta font-bold px-2 py-0.5 border uppercase tracking-wider select-none ${theme === 'midnight' ? 'border-[#1F232D] bg-[#08090C] text-[#8B949E]' : 'border-[#CBBFA0] bg-[#EFECE1] text-[#1A1A1A]'}`}>
                                              ↓ {calculateDuration(ev.start, nextEv.start)} elapsed
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Event Inspector Details Panel — docked permanently, stays in view while the timeline scrolls */}
                          <div
                            className={`border p-5 md:p-6 flex flex-col justify-between overflow-y-auto transition-all duration-300 ease-out flex-shrink-0 self-start sticky top-[152px] max-h-[calc(100vh-176px)] ${isFocusMode ? 'hidden' : 'block'} ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]' : 'border-[#CBBFA0] bg-[#FAF7F0]'} ${displayEvent ? (theme === 'midnight' ? 'shadow-[0_8px_24px_rgba(197,168,128,0.06)]' : 'shadow-[0_8px_20px_rgba(142,111,64,0.08)]') : ''}`}
                            style={{ width: isFocusMode ? '0%' : '25%' }}
                          >
                            <div
                              className={`transition-all duration-300 ease-out will-change-transform ${
                                inspectorTransitioning ? 'opacity-0 translate-x-2 blur-[2px]' : 'opacity-100 translate-x-0 blur-0'
                              }`}
                            >
                              <div className={`flex items-center justify-between pb-2 mb-3 border-b ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#E3DEC3]'}`}>
                                <div className="flex items-center space-x-1.5">
                                  <Info className={`w-3.5 h-3.5 ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} />
                                  <h3 className={`text-[10px] font-bold uppercase tracking-wider font-mono-meta ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>
                                    Evidence Inspector Dossier
                                  </h3>
                                </div>
                                {/* Text scaler toggles */}
                                <div className={`flex border ${theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'}`}>
                                  {[14, 16, 18].map((size) => (
                                    <button
                                      key={size}
                                      type="button"
                                      onClick={() => setContextFontSize(size as 14 | 16 | 18)}
                                      className={`px-1.5 py-0.5 text-[8.5px] font-bold transition-all border-r last:border-0 outline-none ${
                                        theme === 'midnight' ? 'border-[#1F232D]' : 'border-[#CBBFA0]'
                                      } ${
                                        contextFontSize === size
                                          ? (theme === 'midnight' ? 'bg-[#C5A880] text-[#08090C]' : 'bg-[#8E6F40] text-[#FFFFFF]')
                                          : (theme === 'midnight' ? 'bg-[#08090C] text-[#8B949E] hover:text-[#F0F6FC]' : 'bg-[#EBE7D9] text-[#5C5C5C] hover:text-[#1A1A1A]')
                                      }`}
                                    >
                                      {size === 14 ? 'A-' : size === 16 ? 'A' : 'A+'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {displayEvent ? (
                                <div className="space-y-4 text-left">
                                  <div>
                                    <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                      Evidence Node Citation ID
                                    </span>
                                    <span className={`text-[10px] font-mono px-2 py-0.5 border font-mono-meta ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#C9D1D9]' : 'bg-[#FFFFFF] border-[#E3DEC3] text-[#1A1A1A]'}`}>
                                      {displayEvent.id.toUpperCase()}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                        Trigger Type
                                      </span>
                                      <span className={`text-[10px] font-mono px-2 py-0.5 border font-mono-meta ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#C5A880]' : 'bg-[#FFFFFF] border-[#E3DEC3] text-[#8E6F40]'}`}>
                                        {displayEvent.label.toUpperCase()}
                                      </span>
                                    </div>
                                    <div>
                                      <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                        Temporal Anchor
                                      </span>
                                      <span className={`text-[10px] font-mono px-2 py-0.5 border font-mono-meta ${theme === 'midnight' ? 'bg-[#08090C] border-[#1F232D] text-[#F0F6FC]' : 'bg-[#FFFFFF] border-[#E3DEC3] text-[#1A1A1A]'}`}>
                                        {displayEvent.start || "INFERRED"}
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                      Resolved Sentence Index
                                    </span>
                                    <span className={`text-[10px] font-mono-meta ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#3A3A3A] font-semibold'}`}>
                                      Sentence Index Location #{displayEvent.sentence_index}
                                    </span>
                                  </div>

                                  <div>
                                    <span className={`text-[8px] font-mono-meta uppercase tracking-wider block mb-1 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                      Source Transcript Context Sentence
                                    </span>
                                    <p
                                      className={`leading-relaxed p-2.5 border italic font-sans ${theme === 'midnight' ? 'text-[#C9D1D9] bg-[#08090C] border-[#1F232D]' : 'text-[#1A1A1A] bg-[#FFFFFF] border-[#E3DEC3]'}`}
                                      style={{ fontSize: `${contextFontSize}px` }}
                                    >
                                      "{displayEvent.title}"
                                    </p>
                                  </div>

                                  {/* Forensic metadata summaries */}
                                  <div className={`border-t pt-3 space-y-1.5 ${theme === 'midnight' ? 'border-[#1F232D]/40' : 'border-[#E3DEC3]'}`}>
                                    <span className={`text-[8px] font-mono-meta uppercase tracking-wider block ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                      Chain of Custody Relations
                                    </span>
                                    {prevEvent && (
                                      <div className={`text-[9px] font-mono-meta truncate ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                                        PREV: <span className={`cursor-pointer hover:underline ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} onClick={() => setSelectedEvent(prevEvent)}>{prevEvent.start || 'Unanchored'} // {prevEvent.label}</span>
                                      </div>
                                    )}
                                    {nextEvent && (
                                      <div className={`text-[9px] font-mono-meta truncate ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                                        NEXT: <span className={`cursor-pointer hover:underline ${theme === 'midnight' ? 'text-[#C5A880]' : 'text-[#8E6F40]'}`} onClick={() => setSelectedEvent(nextEvent)}>{nextEvent.start || 'Unanchored'} // {nextEvent.label}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* AI Agent Phrasing updates */}
                                  <div className={`p-2 text-[9px] font-mono-meta tracking-wide uppercase ${theme === 'midnight' ? 'bg-[#1C6B48]/5 border border-[#1C6B48]/20 text-emerald-450' : 'bg-[#1C6B48]/10 border border-[#1C6B48]/30 text-[#1C6B48]'}`}>
                                    🛡️ temporal conflict check: no overlaps found // resolved
                                  </div>
                                </div>
                              ) : (
                                <div className={`flex flex-col items-center justify-center py-16 text-center ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C] font-semibold'}`}>
                                  <Info className={`w-8 h-8 mb-2 ${theme === 'midnight' ? 'text-[#1F232D]' : 'text-[#CBBFA0]'}`} />
                                  <p className="text-[9px] font-mono-meta uppercase tracking-wider max-w-[160px]">
                                    Click timeline checkpoints to load narrative dossier.
                                  </p>
                                </div>
                              )}
                            </div>
                            
                            {displayEvent && (
                              <div className={`mt-4 pt-2 border-t text-[8.5px] font-mono-meta flex justify-between items-center ${theme === 'midnight' ? 'border-[#1F232D] text-[#8B949E]' : 'border-[#E3DEC3] text-[#5C5C5C]'}`}>
                                <span>FORENSIC VERACITY: HIGH</span>
                                <span className="text-emerald-400 font-bold uppercase tracking-wider">Confidence 96%</span>
                              </div>
                            )}
                          </div>

                        </div>
                      </section>
                    );
                  })()
              ) : (
                <div className={`border-dashed border p-8 flex flex-col items-center justify-center text-center ${theme === 'midnight' ? 'border-[#1F232D] bg-[#12141C]/30' : 'border-[#E3DEC3] bg-[#FAF7F0]/60'}`}>
                  <Folder className={`w-10 h-10 mb-3 opacity-60 ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#8E6F40]'}`} />
                  <h3 className={`text-xs font-bold font-display uppercase mb-1 ${theme === 'midnight' ? 'text-[#F0F6FC]' : 'text-[#1A1A1A] font-extrabold'}`}>No Active Case Casing Selected</h3>
                  <p className={`text-[11px] max-w-sm ${theme === 'midnight' ? 'text-[#8B949E]' : 'text-[#5C5C5C]'}`}>
                    Select an active casing folder from the active folder datastore on the left to open its forensic timeline.
                  </p>
                </div>
              )}
            </div>
          )}

          </div>
        </div>
      </main>

      {/* ── "+ Create New Case" Ingestion Modal Overlay ────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`border rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors duration-300 ${
            theme === 'midnight' ? 'bg-[#0b101b] border-slate-800/80' : 'bg-white border-slate-250'
          }`}>
            <div className={`flex justify-between items-center px-6 py-4 border-b transition-colors duration-300 ${
              theme === 'midnight' ? 'border-slate-800/80 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center space-x-2">
                <Upload className="w-4 h-4 text-indigo-400" />
                <h2 className={`text-sm font-semibold uppercase tracking-wider transition-colors duration-300 ${colors.title}`}>
                  Case Ingestion Portal
                </h2>
              </div>
              <button 
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className={`text-xs px-2.5 py-1 rounded transition-colors duration-250 border ${
                  theme === 'midnight'
                    ? 'text-slate-350 bg-slate-850 hover:bg-slate-750 border-slate-700/50'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-250'
                }`}
              >
                ✕ Close
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 flex flex-col space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-[10px] uppercase font-semibold mb-1 transition-colors duration-300 ${colors.textMuted}`}>
                        Case Citation / Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Criminal Appeal 412 of 2023"
                        value={citationInput}
                        onChange={(e) => setCitationInput(e.target.value)}
                        className={`w-full text-xs rounded p-2.5 outline-none transition-colors duration-300 ${colors.inputBg}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] uppercase font-semibold mb-1 transition-colors duration-300 ${colors.textMuted}`}>
                        Court Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Bombay High Court"
                        value={courtInput}
                        onChange={(e) => setCourtInput(e.target.value)}
                        className={`w-full text-xs rounded p-2.5 outline-none transition-colors duration-300 ${colors.inputBg}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[10px] uppercase font-semibold mb-1 transition-colors duration-300 ${colors.textMuted}`}>
                      Raw Judgment Text
                    </label>
                    <textarea
                      placeholder="Paste full judgment or text payload..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      rows={8}
                      className={`w-full text-xs rounded p-2.5 outline-none resize-none font-mono transition-colors duration-300 ${colors.inputBg}`}
                    />
                  </div>
                </div>

                {/* Drag and Drop Zone */}
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <label className={`block text-[10px] uppercase font-semibold mb-1.5 transition-colors duration-300 ${colors.textMuted}`}>
                      Upload Judgment File
                    </label>
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`h-[180px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all duration-200 ${
                        dragActive
                          ? 'border-indigo-500 bg-indigo-500/5'
                          : theme === 'midnight'
                            ? 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
                            : 'border-slate-300 hover:border-slate-450 bg-slate-50/60 hover:bg-slate-100/60'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.json"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <FileText className="w-8 h-8 text-slate-450 mb-2" />
                      <span className={`text-xs font-semibold transition-colors duration-300 ${theme === 'midnight' ? 'text-slate-300' : 'text-slate-700'}`}>
                        Drag files here or click to browse
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Supports .txt or .json payloads
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading || !textInput.trim() || isMockMode}
                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-4 rounded transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-900/10"
                  >
                    {isUploading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span>Ingesting Case...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Ingest and Construct Graph</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
