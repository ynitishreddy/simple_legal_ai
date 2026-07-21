import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { TimelineEvent, TimelinePayload } from '../App';

export type EventImportance = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * Feature 3: Heuristic rule-based event importance scoring.
 * Critical: Judgment, Conviction, Sentence, Acquittal, Death, Verdict, Dismissed, Allowed
 * High: Arrest, Charge Sheet, Remanded, Custody, Bail, Appeal
 * Medium: Evidence, Witness, Investigation, Hearing, Notice, Trial, FIR
 * Low: Mentions, References, Administrative updates
 */
export function getEventImportance(label: string = '', title: string = ''): EventImportance {
  const text = (label + " " + title).toLowerCase();
  if (
    text.includes('judgment') || text.includes('conviction') || text.includes('sentence') ||
    text.includes('acquittal') || text.includes('acquit') || text.includes('death') ||
    text.includes('dismissed') || text.includes('allowed') || text.includes('confirmed') ||
    text.includes('verdict')
  ) {
    return 'Critical';
  }
  if (
    text.includes('arrest') || text.includes('detain') || text.includes('charge sheet') ||
    text.includes('chargesheet') || text.includes('charge') || text.includes('bail') ||
    text.includes('appeal') || text.includes('remand') || text.includes('custody')
  ) {
    return 'High';
  }
  if (
    text.includes('evidence') || text.includes('witness') || text.includes('investigat') ||
    text.includes('hearing') || text.includes('notice') || text.includes('trial') ||
    text.includes('fir') || text.includes('seizure') || text.includes('recovery')
  ) {
    return 'Medium';
  }
  return 'Low';
}

interface NetworkGraphCanvasProps {
  timeline: TimelinePayload;
  selectedEvent: TimelineEvent | null;
  onSelectEvent: (ev: TimelineEvent) => void;
  theme: 'midnight' | 'parchment';
  filteredNodeIds?: Set<string>;
}

export default function NetworkGraphCanvas({
  timeline,
  selectedEvent,
  onSelectEvent,
  theme,
  filteredNodeIds,
}: NetworkGraphCanvasProps) {
  const { nodes, edges } = timeline;

  // Viewport zoom & pan states
  const [zoom, setZoom] = useState(0.85);
  const [panX, setPanX] = useState(60);
  const [panY, setPanY] = useState(40);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate layout coordinates programmatically
  const nodeWidth = 220;
  const nodeHeight = 90;
  const xSpacing = 300;
  const ySpacing = 145;
  const centerY = 160;

  // Group nodes by start date
  const dateGroups: Record<string, TimelineEvent[]> = {};
  nodes.forEach((node) => {
    const dateKey = node.start || "unanchored";
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = [];
    }
    dateGroups[dateKey].push(node);
  });

  // Sort dates (unanchored dates go to the end)
  const sortedDates = Object.keys(dateGroups).sort((a, b) => {
    if (a === "unanchored") return 1;
    if (b === "unanchored") return -1;
    return a.localeCompare(b);
  });

  // Build coordinate positions dictionary
  const nodePositions: Record<string, { x: number; y: number }> = {};
  sortedDates.forEach((dateKey, xIdx) => {
    const group = dateGroups[dateKey];
    const x = 120 + xIdx * xSpacing;
    group.forEach((node, yIdx) => {
      // Stack vertically around centerY
      const offset = (yIdx - (group.length - 1) / 2) * ySpacing;
      nodePositions[node.id] = { x, y: centerY + offset };
    });
  });

  // Compute a zoom/pan that fits the entire node graph inside the current viewport
  const fitView = useCallback(() => {
    const el = containerRef.current;
    const ids = Object.keys(nodePositions);
    if (!el || ids.length === 0 || el.clientWidth === 0 || el.clientHeight === 0) return false;

    const xs = ids.map((id) => nodePositions[id].x);
    const ys = ids.map((id) => nodePositions[id].y);
    const minX = Math.min(...xs) - nodeWidth / 2;
    const maxX = Math.max(...xs) + nodeWidth / 2;
    const minY = Math.min(...ys) - nodeHeight / 2;
    const maxY = Math.max(...ys) + nodeHeight / 2;
    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);

    const padding = 56;
    const availW = Math.max(1, el.clientWidth - padding * 2);
    const availH = Math.max(1, el.clientHeight - padding * 2);
    const nextZoom = Math.max(0.15, Math.min(1.5, Math.min(availW / graphW, availH / graphH)));

    setZoom(nextZoom);
    setPanX(padding - minX * nextZoom + Math.max(0, (availW - graphW * nextZoom)) / 2);
    setPanY(padding - minY * nextZoom + Math.max(0, (availH - graphH * nextZoom)) / 2);
    return true;
  }, [nodePositions]);

  // Fit the full evidence network into view on initial mount or case change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (fitView()) return;

    const ro = new ResizeObserver(() => {
      if (fitView()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.case_info.id]);

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    setZoom((prev) => Math.max(0.15, Math.min(3, prev * factor)));
  };

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.current.x);
    setPanY(e.clientY - dragStart.current.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    if (fitView()) return;
    setPanX(80);
    setPanY(50);
    setZoom(0.85);
  };

  // Node styling based on Importance & Categories (Feature 3)
  const getNodeStyling = (node: TimelineEvent) => {
    const importance = getEventImportance(node.label, node.title);
    const l = node.label.toLowerCase();

    // Base importance border & glow shadows
    if (importance === 'Critical') {
      return theme === 'midnight'
        ? 'border-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.45)]'
        : 'border-rose-600 shadow-[0_0_12px_rgba(225,29,72,0.35)]';
    }
    if (importance === 'High') {
      return theme === 'midnight'
        ? 'border-amber-500 shadow-[0_0_11px_rgba(245,158,11,0.38)]'
        : 'border-amber-600 shadow-[0_0_9px_rgba(217,119,6,0.3)]';
    }
    if (importance === 'Medium') {
      if (l.includes('bail') || l.includes('release') || l.includes('acquit')) {
        return 'border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
      }
      return theme === 'midnight'
        ? 'border-indigo-500/80 shadow-[0_0_7px_rgba(99,102,241,0.25)]'
        : 'border-indigo-600/70 shadow-[0_0_6px_rgba(79,70,229,0.2)]';
    }
    // Low importance
    return theme === 'midnight'
      ? 'border-slate-800 focus:border-indigo-500/50'
      : 'border-slate-250 focus:border-indigo-500/50';
  };

  // Badge for Importance (Feature 3)
  const renderImportanceBadge = (node: TimelineEvent) => {
    const importance = getEventImportance(node.label, node.title);
    if (importance === 'Critical') {
      return <span className="text-[7px] font-extrabold px-1 py-0.2 rounded uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">Critical</span>;
    }
    if (importance === 'High') {
      return <span className="text-[7px] font-extrabold px-1 py-0.2 rounded uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">High</span>;
    }
    if (importance === 'Medium') {
      return <span className="text-[7px] font-extrabold px-1 py-0.2 rounded uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">Med</span>;
    }
    return <span className="text-[7px] font-medium px-1 py-0.2 rounded uppercase bg-slate-500/20 text-slate-400 border border-slate-500/30">Low</span>;
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full rounded-xl overflow-hidden border transition-colors duration-300 flex flex-col md:flex-row ${
        theme === 'midnight' ? 'bg-[#0b0f19] border-slate-800/80' : 'bg-[#FAF6EE] border-slate-250 shadow-inner'
      }`}
    >
      {/* Floating Canvas controls overlay (Top-Left) */}
      <div className="absolute top-3 left-3 z-20 flex space-x-2">
        <button
          type="button"
          onClick={handleReset}
          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all duration-200 hover:shadow-sm outline-none ${
            theme === 'midnight'
              ? 'bg-slate-850 hover:bg-slate-750 text-slate-200 border-slate-700'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-250'
          }`}
        >
          🎯 Reset View
        </button>
        <div className={`px-2 py-1 rounded text-[10px] border select-none ${
          theme === 'midnight' ? 'bg-slate-900/60 text-slate-400 border-slate-800' : 'bg-white/80 text-slate-500 border-slate-200'
        }`}>
          🔍 Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Feature 4: Theme-Adaptable Graph Legend */}
      {/* Desktop: Right side floating overlay | Mobile: Below canvas */}
      <div className={`z-20 p-2.5 rounded-lg border text-[9.5px] select-none transition-colors duration-300 ${
        // Desktop positioning: right top floating panel
        'md:absolute md:top-3 md:right-3 md:w-44 md:shadow-md'
      } ${
        // Mobile positioning: bottom bar fallback
        'w-full md:w-44 border-t md:border mt-auto'
      } ${
        theme === 'midnight'
          ? 'bg-[#0d121f]/95 border-slate-800/90 text-slate-300 shadow-slate-950/40'
          : 'bg-[#F5F0E6]/95 border-slate-300 text-slate-800 shadow-slate-300/50'
      }`}>
        <div className={`font-bold uppercase tracking-wider text-[9px] mb-1.5 pb-1 border-b ${
          theme === 'midnight' ? 'text-indigo-400 border-slate-800' : 'text-indigo-700 border-slate-300'
        }`}>
          🗺️ Graph Legend
        </div>
        <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.6)]"></span>
            <span>🔴 Arrest / Custody</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]"></span>
            <span>🟢 Bail / Release</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.6)]"></span>
            <span>🔵 Trial / Procedural</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_4px_rgba(168,85,247,0.6)]"></span>
            <span>🟣 Investigation</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]"></span>
            <span>🟡 Evidence / Witness</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 dark:bg-slate-100 shadow-[0_0_4px_rgba(15,23,42,0.6)]"></span>
            <span>⚫ Judgment / Verdict</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas element */}
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing select-none flex-1"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Markers definitions */}
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={theme === 'midnight' ? '#6366f1' : '#4f46e5'} />
          </marker>
        </defs>

        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* Edges layer */}
          {edges.map((edge) => {
            const posFrom = nodePositions[edge.from];
            const posTo = nodePositions[edge.to];
            if (!posFrom || !posTo) return null;

            // Check if connected nodes match active filters
            const isFromVisible = !filteredNodeIds || filteredNodeIds.has(edge.from);
            const isToVisible = !filteredNodeIds || filteredNodeIds.has(edge.to);
            const isEdgeDimmed = filteredNodeIds && (!isFromVisible || !isToVisible);

            // Straight line or Bezier curve offsets
            const dx = posTo.x - posFrom.x;
            const startX = posFrom.x + nodeWidth / 2;
            const startY = posFrom.y;
            const endX = posTo.x - nodeWidth / 2;
            const endY = posTo.y;

            // Compute curve control points to form smooth S-shape curve
            const controlX1 = startX + Math.max(40, dx * 0.45);
            const controlY1 = startY;
            const controlX2 = endX - Math.max(40, dx * 0.45);
            const controlY2 = endY;

            const isSimultaneous = edge.label.toUpperCase() === 'SIMULTANEOUS';
            const pathData = `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`;

            return (
              <g key={edge.id} className={isEdgeDimmed ? 'opacity-20 transition-opacity duration-300' : 'opacity-100 transition-opacity duration-300'}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={
                    isSimultaneous
                      ? theme === 'midnight' ? '#64748b' : '#94a3b8'
                      : theme === 'midnight' ? '#818cf8' : '#6366f1'
                  }
                  strokeWidth={isSimultaneous ? 1.5 : 2}
                  strokeDasharray={isSimultaneous ? '4 4' : undefined}
                  markerEnd={isSimultaneous ? undefined : 'url(#arrowhead)'}
                  className="transition-all duration-300 opacity-60 hover:opacity-100"
                />
                {/* Edge label badge */}
                <foreignObject
                  x={(startX + endX) / 2 - 35}
                  y={(startY + endY) / 2 - 10}
                  width="70"
                  height="20"
                  className="overflow-visible"
                >
                  <div className="flex justify-center items-center h-full">
                    <span className={`text-[7.5px] px-1 rounded-full border shadow-sm select-none ${
                      theme === 'midnight'
                        ? 'bg-slate-950/90 text-slate-400 border-slate-900'
                        : 'bg-white/90 text-slate-600 border-slate-200'
                    }`}>
                      {edge.label}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Nodes layer */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            const isSelected = selectedEvent?.id === node.id;
            const isVisible = !filteredNodeIds || filteredNodeIds.has(node.id);

            return (
              <foreignObject
                key={node.id}
                x={pos.x - nodeWidth / 2}
                y={pos.y - nodeHeight / 2}
                width={nodeWidth}
                height={nodeHeight}
                className={`overflow-visible cursor-pointer transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-25 pointer-events-none'}`}
                onClick={() => isVisible && onSelectEvent(node)}
              >
                <div className={`p-2.5 rounded-lg border text-left transition-all duration-205 select-none ${
                  isSelected
                    ? theme === 'midnight'
                      ? 'bg-indigo-650/15 border-indigo-400 text-white shadow-lg shadow-indigo-900/20 scale-105'
                      : 'bg-indigo-50 border-indigo-400 text-indigo-950 font-medium shadow-md scale-105'
                    : theme === 'midnight'
                      ? 'bg-[#101524]/90 hover:bg-[#151c30] text-slate-200'
                      : 'bg-white hover:bg-slate-50 text-slate-850 shadow-sm'
                } ${getNodeStyling(node)}`}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center space-x-1.5 truncate max-w-[130px]">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase truncate">
                        {node.label}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {renderImportanceBadge(node)}
                      <span className={`text-[7.5px] px-1 py-0.5 rounded border ${
                        theme === 'midnight' ? 'bg-slate-900/80 border-slate-850 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {node.start || "No Date"}
                      </span>
                    </div>
                  </div>
                  <p className={`text-[9.5px] line-clamp-2 leading-snug ${theme === 'midnight' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {node.title}
                  </p>
                </div>
              </foreignObject>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
