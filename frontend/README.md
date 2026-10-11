# ⚖️ Simple Legal AI — Frontend Client

> **Interactive Legal Timeline and Temporal Event Graph Visualizer**

The frontend for **Simple Legal AI** is a modern React application designed to visualize complex legal judgment timelines, explore temporal event relationships via an interactive canvas DAG, inspect case metadata, and upload new court judgments.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Directory Layout](#-directory-layout)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development Server](#development-server)
  - [Production Build](#production-build)
- [Backend Integration & Proxy](#-backend-integration--proxy)
- [UI Architecture & Components](#-ui-architecture--components)
  - [Network Graph Canvas](#1-network-graph-canvas)
  - [Chronological Timeline](#2-chronological-timeline)
  - [Document Upload & OCR Preview](#3-document-upload--ocr-preview)
  - [Search & Filtering](#4-search--filtering)
  - [Theming](#5-theming)

---

## 🔍 Overview

Understanding legal proceedings from raw text is difficult because facts and procedural history are often narrated non-sequentially. The **Simple Legal AI** client bridges this gap by rendering:
1. An **interactive directed graph canvas** depicting causal and temporal relationships (`BEFORE`, `AFTER`, `SIMULTANEOUS`, `OVERLAPS`).
2. A **chronological timeline stream** that orders events by normalized ISO date, calculating real-world elapsed time intervals between stages (e.g., *"+ 4 months 12 days"*).
3. A **case inspector** summarizing judges, petitioner, respondent, citation, and statutory provisions (Acts, Articles, Sections).

---

## ✨ Key Features

- **🕸️ Canvas-Based Temporal Graph (`NetworkGraphCanvas.tsx`)**:
  - High-performance HTML5 Canvas rendering for directed acyclic graphs (DAGs).
  - Force-directed layout with pan, zoom, click-to-select, and drag interactions.
  - Color-coded node badges reflecting legal event importance.
- **⏱️ Chronological Timeline View**:
  - Natural chronological ordering with formatted dates.
  - Automatically calculates elapsed duration between consecutive events.
  - Displays trigger words, actors, categories, and full context sentences.
- **📄 Document Upload & OCR Preview**:
  - Drag-and-drop or file select for `.pdf`, `.txt`, and `.json` documents.
  - Live pre-upload analysis via `POST /api/cases/analyze-file`.
  - Visual indicator when scanned documents required OCR extraction.
  - Editable metadata fields (citation, court, petitioner, respondent) before final submission.
- **🔎 In-Depth Search & Highlighting**:
  - Real-time search across event titles, trigger words, sentences, and actors.
  - Dynamic text highlighting that adapts to the active theme.
- **🎯 Category & Importance Filtering**:
  - Filter events by legal stage: *Arrest*, *Custody*, *Investigation*, *FIR*, *Charge Sheet*, *Evidence*, *Witness*, *Trial*, *Bail*, *Appeal*, *Judgment*, *Conviction*, *Sentence*.
  - Filter events by priority: *Critical*, *High*, *Medium*, *Low*.
- **🌓 Dual Themes**:
  - **Midnight**: Deep slate/charcoal dark mode with gold and amber accents.
  - **Parchment**: Editorial legal-paper light mode with rich navy and maroon typography.

---

## 💻 Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vitejs.dev/) with Fast Refresh
- **Styling**: [Tailwind CSS 3.4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Linting**: [Oxlint](https://oxc.rs/)

---

## 📁 Directory Layout

```
frontend/
├── package.json             # Dependencies and scripts
├── vite.config.ts           # Vite configuration with /api backend proxy
├── tailwind.config.js       # Tailwind CSS styling tokens
├── tsconfig.json            # TypeScript configuration
├── index.html               # Main HTML entrypoint
│
└── src/
    ├── main.tsx             # React DOM root mounting
    ├── App.tsx              # Main dashboard view, state management, upload dialog
    ├── index.css            # Base Tailwind styles and font configurations
    ├── App.css              # Custom layout rules
    └── components/
        └── NetworkGraphCanvas.tsx # Interactive HTML5 Canvas DAG visualizer
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18.0 or higher**
- **npm** (included with Node.js)

### Installation

Navigate to the `frontend/` directory and install dependencies:

```bash
cd frontend
npm install
```

### Development Server

Ensure your FastAPI backend is running on `http://localhost:8000`, then start the Vite development server:

```bash
npm run dev
```

Open your browser to: **`http://localhost:5173`**

### Production Build

To build the optimized static production bundle:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

To run the linter:

```bash
npm run lint
```

---

## 🔌 Backend Integration & Proxy

The frontend communicates with the backend via REST endpoints under the `/api` prefix. 

In `vite.config.ts`, requests to `/api` are automatically proxied to the FastAPI server:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

This prevents CORS issues during local development and allows seamless API interaction.

---

## 🧩 UI Architecture & Components

### 1. Network Graph Canvas (`NetworkGraphCanvas.tsx`)
- Renders events as nodes and temporal relations (`BEFORE`, `AFTER`, etc.) as directed arrows.
- Implements heuristic importance scoring:
  - **Critical**: Judgments, convictions, sentences, acquittals, verdicts.
  - **High**: Arrests, charge sheets, custody, bail, appeals.
  - **Medium**: Evidence, witnesses, hearings, notices, FIRs.
  - **Low**: Administrative proceedings, general mentions.
- Supports canvas drag, zoom with mouse wheel, and node selection with auto-centering.

### 2. Chronological Timeline (`App.tsx`)
- Displays an ordered vertical stream of events.
- Computes human-readable elapsed duration between consecutive timeline dates using `calculateDuration()`.
- Highlights currently selected events synchronized with the graph canvas.

### 3. Document Upload & OCR Preview
- File modal allows drag-and-drop or browsing for judgment documents.
- Triggers instant pre-analysis showing:
  - Total extracted characters and page count.
  - OCR status indicator (`OCR Triggered` if scanned image PDF).
  - Pre-filled editable metadata form.

### 4. Search & Filtering
- Instant debounced search bar with `highlightText()` helper.
- Multi-category checkboxes and importance level toggles.

### 5. Theming
- Instant theme toggle between `midnight` (dark) and `parchment` (light).
- Applies semantic CSS classes dynamically for buttons, badges, borders, and canvas rendering colors.
