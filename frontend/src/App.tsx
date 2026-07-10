import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderOpen, 
  Upload, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Activity, 
  Info,
  ServerCrash
} from 'lucide-react';

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

// Helper to color-code chrono-bubble markers based on event triggers and theme
function getBubbleColorClass(label: string, theme: 'midnight' | 'parchment'): string {
  const l = label.toLowerCase();
  if (l.includes('arrest') || l.includes('detain') || l.includes('remand') || l.includes('custody') || l.includes('detention') || l.includes('charge')) {
    return theme === 'midnight'
      ? 'bg-slate-950 border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
      : 'bg-white border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]';
  }
  if (l.includes('bail') || l.includes('release') || l.includes('acquit') || l.includes('acquittal') || l.includes('allow') || l.includes('grant')) {
    return theme === 'midnight'
      ? 'bg-slate-950 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
      : 'bg-white border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
  }
  return theme === 'midnight'
    ? 'bg-slate-950 border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'
    : 'bg-white border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]';
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CaseMetadata {
  id: string;
  case_citation: string;
  court_name: string;
  status: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  label: string;
  title: string;
  start: string;
  sentence_index: number;
}

interface TimelineEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

interface TimelinePayload {
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
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'workspace'>('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelinePayload>>({});

  // Theme & Redesign States
  const [theme, setTheme] = useState<'midnight' | 'parchment'>('midnight');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [contextFontSize, setContextFontSize] = useState<14 | 16 | 18>(14);
  const [isFocusMode, setIsFocusMode] = useState(false);

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

  const renderStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'PENDING' || s === 'PROCESSING') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          {s}
        </span>
      );
    }
    if (s === 'COMPLETED' || s === 'NLP_COMPLETE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3 mr-1" />
          READY
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertCircle className="w-3 h-3 mr-1" />
        FAILED
      </span>
    );
  };

  // Sorting timeline events chronologically
  const timelineEvents = timeline 
    ? [...timeline.nodes].sort((a, b) => {
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.localeCompare(b.start);
      })
    : [];

  // Dynamic theme styling mapping
  const colors = {
    bg: theme === 'midnight' ? 'bg-[#0F172A]' : 'bg-[#FDFBF7]',
    text: theme === 'midnight' ? 'text-[#e2e8f0]' : 'text-[#1A1A1A]',
    textMuted: theme === 'midnight' ? 'text-slate-400' : 'text-slate-600',
    border: theme === 'midnight' ? 'border-slate-800/80' : 'border-slate-350/60',
    headerBg: theme === 'midnight' ? 'bg-slate-900/60 border-b border-slate-800/80' : 'bg-[#FDFBF7]/90 border-b border-slate-200 shadow-sm',
    sidebarBg: theme === 'midnight' ? 'bg-slate-900/50' : 'bg-white border border-slate-200 shadow-sm',
    cardBg: theme === 'midnight' ? 'bg-slate-900/50' : 'bg-white shadow-sm border border-slate-200',
    cardBgHover: theme === 'midnight' ? 'bg-slate-900/10' : 'bg-slate-50',
    tabBg: theme === 'midnight' ? 'bg-[#0c1220]/80 border-b border-slate-800/80' : 'bg-[#FAF6EE]/90 border-b border-slate-200',
    panelBg: theme === 'midnight' ? 'bg-slate-950/50 border border-slate-850' : 'bg-[#FAF6EE] border border-slate-200 shadow-inner',
    title: theme === 'midnight' ? 'text-white' : 'text-slate-900',
    inputBg: theme === 'midnight' ? 'bg-slate-950 border border-slate-800 focus:border-indigo-500/50' : 'bg-[#FAF6EE] border-slate-300 text-[#1A1A1A] focus:border-indigo-500/50',
    detailsBg: theme === 'midnight' ? 'bg-slate-950/50 border border-slate-850' : 'bg-white shadow-md border border-slate-200',
    snippetBg: theme === 'midnight' ? 'bg-slate-950 border border-slate-900' : 'bg-[#FAF6EE] border border-slate-200',
  };

  // Client-side filtering based on searchQuery
  const filteredCases = cases.filter(c => 
    c.case_citation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.court_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen ${colors.bg} ${colors.text} flex flex-col transition-colors duration-300`}>
      {/* ── Top Header Bar ───────────────────────────────────────────────────── */}
      <header className={`backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between transition-colors duration-300 ${colors.headerBg}`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className={`text-xl font-bold tracking-tight font-sans transition-colors duration-300 ${colors.title}`}>
              Legal Timeline Construction AI
            </h1>
            <p className={`text-xs ${colors.textMuted} transition-colors duration-300`}>
              Temporal Event Graphs & Natural Language Extraction
            </p>
          </div>
        </div>

        {/* Global Connection & Theme Info */}
        <div className="flex items-center space-x-3">
          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'midnight' ? 'parchment' : 'midnight')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-300 outline-none ${
              theme === 'midnight' 
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750' 
                : 'bg-amber-50 border-amber-250 text-amber-800 hover:bg-amber-100 shadow-sm'
            }`}
          >
            <span>{theme === 'midnight' ? '📖 Legal Parchment' : '🌙 Midnight Brief'}</span>
          </button>

          {isMockMode ? (
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
              <ServerCrash className="w-3.5 h-3.5" />
              <span>Offline Sandbox Fallback Mode Active</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Backend Server Connected</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Sub-Header Navigation Bar ────────────────────────────────────────── */}
      <div className={`px-6 py-2 flex items-center justify-between transition-colors duration-300 ${colors.tabBg}`}>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
              currentTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : theme === 'midnight'
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentTab('workspace')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
              currentTab === 'workspace'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : theme === 'midnight'
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Case Workspace
          </button>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-1.5 px-4 rounded-lg shadow-lg shadow-indigo-950/20 transition-all duration-200 flex items-center space-x-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>+ Create New Case</span>
        </button>
      </div>

      {/* ── Main Panel Grid Layout ───────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* PANEL A: Case Explorer Sidebar (3 Cols) */}
        <section className={`lg:col-span-3 flex flex-col space-y-4 h-full transition-all duration-300 ${isFocusMode ? 'hidden' : 'block'}`}>
          <div className={`backdrop-blur-md rounded-xl p-4 flex flex-col h-[520px] transition-colors duration-300 ${colors.sidebarBg}`}>
            <div className={`flex items-center space-x-2 pb-3 mb-3 border-b transition-colors duration-300 ${colors.border}`}>
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <h2 className={`text-sm font-semibold uppercase tracking-wider transition-colors duration-300 ${colors.title}`}>
                Case Explorer
              </h2>
            </div>

            {/* Search filter input */}
            <div className="mb-3 relative">
              <input
                type="text"
                placeholder="Search cases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full text-xs rounded-lg pl-3 pr-8 py-1.5 outline-none transition-colors duration-300 ${colors.inputBg}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-[10px] text-slate-500 hover:text-white transition-colors duration-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Ingested Cases List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredCases.length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-full ${colors.textMuted} text-xs py-8`}>
                  <span>No court cases match search.</span>
                </div>
              ) : (
                filteredCases.map((c) => {
                  const isSelected = selectedCaseId === c.id;
                  const isProcessing = c.status.toUpperCase() === 'PROCESSING' || c.status.toUpperCase() === 'PENDING';
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCaseId(c.id);
                        fetchTimeline(c.id);
                        setCurrentTab('workspace');
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 block ${
                        isSelected
                          ? theme === 'midnight'
                            ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-900/10 font-medium'
                            : 'bg-indigo-50 border-indigo-300 text-indigo-950 font-medium shadow-sm'
                          : theme === 'midnight'
                            ? 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-850 hover:border-slate-700 text-slate-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-750'
                      } ${isProcessing ? 'animate-pulse-slow bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-indigo-500/5' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="font-semibold text-xs truncate max-w-[130px]" title={c.case_citation}>
                          {c.case_citation}
                        </span>
                        {renderStatusBadge(c.status)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span className="truncate max-w-[120px]">{c.court_name}</span>
                        <span>{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Pagination controls */}
            <div className={`flex items-center justify-between pt-3 mt-3 border-t transition-colors duration-300 ${colors.border}`}>
              <span className="text-[10px] text-slate-400">
                Total: {totalCases} cases
              </span>
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className={`p-1 rounded border transition-colors duration-200 disabled:opacity-30 disabled:pointer-events-none ${
                    theme === 'midnight' 
                      ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/50' 
                      : 'bg-white hover:bg-slate-100 border-slate-250 text-slate-700'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs px-2 text-slate-350">
                  {currentPage}
                </span>
                <button
                  disabled={skip + limit >= totalCases}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className={`p-1 rounded border transition-colors duration-200 disabled:opacity-30 disabled:pointer-events-none ${
                    theme === 'midnight' 
                      ? 'bg-slate-800 hover:bg-slate-750 border-slate-700/50' 
                      : 'bg-white hover:bg-slate-100 border-slate-250 text-slate-700'
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
          
          {/* ── View A: Analytics Dashboard ── */}
          {currentTab === 'dashboard' && (
            <div className="flex flex-col space-y-6">
              <div className={`backdrop-blur-md rounded-xl p-6 transition-colors duration-300 ${colors.sidebarBg}`}>
                <h2 className={`text-lg font-bold mb-1 transition-colors duration-300 ${colors.title}`}>System Overview & Analytics</h2>
                <p className={`text-xs mb-6 font-sans transition-colors duration-300 ${colors.textMuted}`}>Real-time database metrics for processed legal case temporal graphs.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Metric 1 */}
                  <div className={`p-5 rounded-xl transition-colors duration-300 ${colors.cardBg}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Total Cases Processed</span>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-3xl font-extrabold transition-colors duration-300 ${colors.title}`}>{cases.length}</span>
                      <span className="text-xs text-slate-400">active</span>
                    </div>
                  </div>

                  {/* Metric 2 */}
                  <div className={`p-5 rounded-xl transition-colors duration-300 ${colors.cardBg}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Total Events Discovered</span>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-3xl font-extrabold transition-colors duration-300 ${theme === 'midnight' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                        {Object.values(timelineCache).reduce((acc, tl) => acc + (tl?.nodes?.length || 0), 0)}
                      </span>
                      <span className="text-xs text-slate-400">elements</span>
                    </div>
                  </div>

                  {/* Metric 3 */}
                  <div className={`p-5 rounded-xl transition-colors duration-300 ${colors.cardBg}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Pipeline Queue Status</span>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-3xl font-extrabold ${
                        cases.filter(c => c.status.toUpperCase() === 'PENDING' || c.status.toUpperCase() === 'PROCESSING').length > 0 
                          ? 'text-amber-400 animate-pulse' 
                          : colors.textMuted
                      }`}>
                        {cases.filter(c => c.status.toUpperCase() === 'PENDING' || c.status.toUpperCase() === 'PROCESSING').length}
                      </span>
                      <span className="text-xs text-slate-400">processing</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Selection Helper Card */}
              <div className={`p-8 rounded-xl flex flex-col items-center justify-center text-center border-dashed border-2 transition-colors duration-300 ${theme === 'midnight' ? 'border-slate-800 bg-slate-900/10' : 'border-slate-300/60 bg-white/50'}`}>
                <FolderOpen className="w-12 h-12 text-slate-500 mb-3 opacity-60" />
                <h3 className={`text-sm font-semibold mb-1 transition-colors duration-300 ${colors.title}`}>Inspect Chronological Timelines</h3>
                <p className={`text-xs max-w-sm transition-colors duration-300 ${colors.textMuted}`}>
                  Select any legal case from the Explorer sidebar to launch the deep-dive Case Workspace timeline visualizer.
                </p>
              </div>
            </div>
          )}

          {/* ── View B: Case Workspace ── */}
          {currentTab === 'workspace' && (
            <div className="flex flex-col space-y-6 flex-1 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Case Summary Card */}
              {timeline ? (
                <div className={`border rounded-xl p-5 shadow-md transition-colors duration-300 ${theme === 'midnight' ? 'bg-indigo-950/10 border-indigo-500/20' : 'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-400 tracking-wide uppercase block mb-0.5">
                        Active Case Workspace
                      </span>
                      <h2 className={`text-base font-bold transition-colors duration-300 ${colors.title}`}>{timeline.case_info.citation}</h2>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Focus Mode button */}
                      <button
                        type="button"
                        onClick={() => setIsFocusMode(!isFocusMode)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all duration-300 outline-none ${
                          theme === 'midnight' 
                            ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750' 
                            : 'bg-white border-slate-250 text-slate-700 hover:bg-slate-50 shadow-sm'
                        }`}
                      >
                        {isFocusMode ? "✕ Exit Focus" : "🔍 Focus Mode"}
                      </button>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-450 border border-indigo-500/20">
                        {timeline.case_info.court}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">
                      Case Overview Snippet
                    </span>
                    <p className={`text-xs leading-relaxed italic p-3 rounded border font-serif-legal transition-colors duration-300 ${colors.snippetBg} ${colors.text}`}>
                      {timeline.case_info.raw_text 
                        ? (timeline.case_info.raw_text.substring(0, 250) + (timeline.case_info.raw_text.length > 250 ? '...' : '')) 
                        : "No raw text available for preview..."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`border-dashed border-2 p-8 rounded-xl flex flex-col items-center justify-center text-center transition-colors duration-300 ${theme === 'midnight' ? 'border-slate-800 bg-slate-900/10' : 'border-slate-300/60 bg-white/50'}`}>
                  <FolderOpen className="w-12 h-12 text-slate-500 mb-3 opacity-60" />
                  <h3 className={`text-sm font-semibold mb-1 transition-colors duration-300 ${colors.title}`}>No Case Selected</h3>
                  <p className={`text-xs max-w-sm transition-colors duration-300 ${colors.textMuted}`}>
                    Select a court case from the Explorer sidebar to render its temporal event graph.
                  </p>
                </div>
              )}

              {/* PANEL C: Interactive Timeline & Detail Drawer */}
              {timeline && (
                <section className={`backdrop-blur-md border rounded-xl p-4 flex-1 flex flex-col min-h-[300px] transition-colors duration-300 ${colors.sidebarBg}`}>
                  <div className={`flex justify-between items-center pb-3 mb-4 border-b transition-colors duration-300 ${colors.border}`}>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-indigo-400" />
                      <h2 className={`text-sm font-semibold uppercase tracking-wider transition-colors duration-300 ${colors.title}`}>
                        Temporal Event Graph & Timeline
                      </h2>
                    </div>
                  </div>

                  {/* Visual Workspace Split (Timeline Left/Detail Inspector Right) */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
                    
                    {/* Left Timeline Scroller */}
                    <div className="md:col-span-8 overflow-y-auto max-h-[380px] pr-2">
                      {timelineEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-12">
                          <Clock className="w-12 h-12 mb-3 opacity-30" />
                          <span>No timeline event data loaded.</span>
                          <span>Wait for NLP analysis to complete.</span>
                        </div>
                      ) : (
                        <div className="relative py-4 pr-1">
                          {/* Centered Gradient Strand Base Line */}
                          <div className={`absolute left-1/2 transform -translate-x-1/2 w-[3px] h-full transition-colors duration-300 ${
                            theme === 'midnight' ? 'bg-slate-800/80' : 'bg-slate-200'
                          }`} />

                          {/* Centered Glowing Highlight Line */}
                          <div 
                            className="absolute left-1/2 transform -translate-x-1/2 w-[3px] bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-600 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                            style={{
                              top: 0,
                              height: hoveredIndex !== null 
                                ? `${Math.min(100, ((hoveredIndex + 0.5) / timelineEvents.length) * 100)}%` 
                                : '0%'
                            }}
                          />

                          {/* Alternating Events */}
                          <div className="space-y-12">
                            {timelineEvents.map((ev, idx) => {
                              const isSelected = selectedEvent?.id === ev.id;
                              const isLeft = idx % 2 === 0;
                              return (
                                <div 
                                  key={ev.id} 
                                  className="flex items-center relative w-full min-h-[80px]"
                                  onMouseEnter={() => setHoveredIndex(idx)}
                                  onMouseLeave={() => setHoveredIndex(null)}
                                >
                                  {/* Chronological bullet marker centered exactly on the line */}
                                  <div className="absolute left-1/2 transform -translate-x-1/2 z-10 flex items-center justify-center">
                                    <span 
                                      onClick={() => setSelectedEvent(ev)}
                                      className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-all duration-300 flex items-center justify-center ${
                                        isSelected
                                          ? 'scale-125 ring-4 ring-indigo-500/20'
                                          : 'hover:scale-110'
                                      } ${getBubbleColorClass(ev.label, theme)}`}
                                    />
                                  </div>

                                  {/* Left Side Content */}
                                  <div className="w-[45%] text-right pr-6 flex flex-col justify-center">
                                    {isLeft ? (
                                      <div 
                                        onClick={() => setSelectedEvent(ev)}
                                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-300 hover:shadow-md ${
                                          isSelected
                                            ? theme === 'midnight'
                                              ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-900/15'
                                              : 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-medium'
                                            : colors.cardBg
                                        }`}
                                      >
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-[9px] font-bold text-indigo-500 tracking-wide uppercase">
                                            {ev.label}
                                          </span>
                                          <span className={`text-[9px] px-1 py-0.5 rounded border ${
                                            theme === 'midnight' 
                                              ? 'bg-slate-950/60 text-slate-400 border-slate-850' 
                                              : 'bg-[#FAF6EE] text-slate-600 border-slate-200'
                                          }`}>
                                            {ev.start || "No Date"}
                                          </span>
                                        </div>
                                        <p className={`text-xs line-clamp-2 leading-relaxed ${theme === 'midnight' ? 'text-slate-350' : 'text-slate-750'}`}>
                                          {ev.title}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className={`text-xs font-semibold ${colors.textMuted}`}>
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
                                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-300 hover:shadow-md ${
                                          isSelected
                                            ? theme === 'midnight'
                                              ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-900/15'
                                              : 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-medium'
                                            : colors.cardBg
                                        }`}
                                      >
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-[9px] font-bold text-indigo-500 tracking-wide uppercase">
                                            {ev.label}
                                          </span>
                                          <span className={`text-[9px] px-1 py-0.5 rounded border ${
                                            theme === 'midnight' 
                                              ? 'bg-slate-950/60 text-slate-400 border-slate-850' 
                                              : 'bg-[#FAF6EE] text-slate-600 border-slate-200'
                                          }`}>
                                            {ev.start || "No Date"}
                                          </span>
                                        </div>
                                        <p className={`text-xs line-clamp-2 leading-relaxed ${theme === 'midnight' ? 'text-slate-350' : 'text-slate-750'}`}>
                                          {ev.title}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className={`text-xs font-semibold ${colors.textMuted}`}>
                                        {ev.start || "Unanchored"}
                                      </span>
                                    )}
                                  </div>

                                  {/* Duration Connector Badge to Next Node */}
                                  {idx < timelineEvents.length - 1 && ev.start && timelineEvents[idx + 1].start && (
                                    <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-[32px] z-20 flex justify-center w-full pointer-events-none">
                                      <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm transition-colors duration-300 ${
                                        theme === 'midnight'
                                          ? 'bg-slate-950 text-indigo-300 border-slate-800'
                                          : 'bg-white text-indigo-700 border-slate-200'
                                      }`}>
                                        ↓ {calculateDuration(ev.start, timelineEvents[idx + 1].start)} elapsed
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

                    {/* Right Event Inspector Details Panel */}
                    <div className={`md:col-span-4 rounded-xl p-4 flex flex-col justify-between max-h-[380px] overflow-y-auto transition-all duration-300 ${colors.detailsBg} ${isFocusMode ? 'hidden' : 'block'}`}>
                      <div>
                        <div className={`flex items-center justify-between pb-2 mb-3 border-b transition-colors duration-300 ${colors.border}`}>
                          <div className="flex items-center space-x-1.5">
                            <Info className="w-3.5 h-3.5 text-indigo-400" />
                            <h3 className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${colors.title}`}>
                              Event Details
                            </h3>
                          </div>
                          {/* Font scale size controller */}
                          <div className="flex items-center space-x-1">
                            {[14, 16, 18].map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => setContextFontSize(size as 14 | 16 | 18)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all duration-200 outline-none ${
                                  contextFontSize === size
                                    ? 'bg-indigo-600 text-white'
                                    : theme === 'midnight'
                                      ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                      : 'bg-slate-200 text-slate-655 hover:bg-slate-300 text-slate-600'
                                }`}
                              >
                                {size === 14 ? 'A-' : size === 16 ? 'A' : 'A+'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {selectedEvent ? (
                          <div className="space-y-4">
                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">
                                Event Name / Trigger
                              </span>
                              <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-455 px-2 py-0.5 rounded border border-indigo-500/20">
                                {selectedEvent.label}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">
                                Timeline Position Date
                              </span>
                              <span className={`text-xs transition-colors duration-300 ${colors.text}`}>
                                {selectedEvent.start || "Unanchored Relative"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">
                                Sentence index offset
                              </span>
                              <span className={`text-xs font-mono transition-colors duration-300 ${colors.textMuted}`}>
                                Sentence #{selectedEvent.sentence_index}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">
                                Full Expanded Context Snippet
                              </span>
                              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-900 italic">
                                "{selectedEvent.title}"
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-12">
                            Click a timeline node to inspect detailed event metrics.
                          </p>
                        )}
                      </div>
                      
                      {selectedEvent && (
                        <div className="mt-4 pt-2 border-t border-slate-900 text-[10px] text-slate-500 flex justify-between items-center">
                          <span>UUID: {selectedEvent.id.substring(0, 8)}...</span>
                          <span className="text-emerald-400 font-bold uppercase">Confidence High</span>
                        </div>
                      )}
                    </div>

                  </div>
                </section>
              )}
            </div>
          )}

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
