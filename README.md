# Brainforest

> A personal knowledge base with an interactive knowledge graph (DAG of linked thoughts) + streaming AI chat — built with FastAPI, SQLite, and vanilla JS.

---

## 🧠 Project Pitch

**Brainforest** is a self-hosted, interactive knowledge graph application that visualizes your thoughts as a DAG (Directed Acyclic Graph). It combines structured knowledge representation with an integrated AI chat (DeepSeek V4 Flash), letting you build, explore, and query a personal "second brain."

Think of it as a visual, AI-powered notebook where every idea can connect to any other idea — and where AI helps you expand your thinking.

---

## 💡 Why This Project Matters

This project demonstrates my ability to tackle full-stack challenges with clean architecture and thoughtful engineering:

- **Complex Data Modeling** — Implemented and visualized a Directed Acyclic Graph (DAG) for thought relationships, handling multi-parent nodes, sibling relationships, and cycle detection.
- **Real-time Interaction** — Built an interactive, zoomable graph UI with vanilla JavaScript, supporting node selection, pan/zoom, and drag-based exploration.
- **AI Integration** — Engineered streaming AI chat (Server-Sent Events) with context attachment, enabling AI-assisted knowledge expansion and one-click saving of responses as new graph nodes.
- **Full-Stack Craft** — Designed a complete web application with FastAPI for high-performance async endpoints, SQLite for persistent storage, and a modular vanilla JS frontend.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI (Python) |
| **Database** | SQLite |
| **Frontend** | Vanilla JS, D3.js (force layouts), CSS3 |
| **AI Integration** | DeepSeek API with Server-Sent Events (SSE) |
| **Deployment** | Python venv, environment variables |

---

## ✨ Features

- **Interactive knowledge graph** — thoughts as nodes in a zoomable DAG. A thought can have multiple parents, siblings are thoughts that share a parent, and cycle detection keeps the graph acyclic. Four layouts (organic, hierarchy, concentric, cascading), a minimap, and a theme toggle.
- **Multi-view exploration** — switch between **Graph**, **Outline**, **Timeline**, and **Review** views. The Review view surfaces orphaned, stale, and disconnected thoughts.
- **Smart search** — exact (BM25 full-text), **semantic** (embeddings), and **AI** (DeepSeek) search modes, filters by thought type and ancestor/descendant focus, and the option to search across all knowledge bases at once.
- **Streaming AI chat** — chat with DeepSeek via Server-Sent Events, optionally attaching the selected thought as context. Auto-generated follow-up questions, and one-click saving of responses as a child, sibling, or root thought.
- **AI-powered graph building** — suggest parents, suggest children & siblings, extract ideas as child thoughts, generate related thoughts, improve titles, generate content, and reanalyze misplaced children.
- **Bilingual** — English primary with Romanian secondary; automatic translation of titles and content.
- **Editing with history** — add/rename/delete thoughts, soft-delete to a recoverable trash, and per-thought **version history** with restore.
- **Bulk operations** — multi-select thoughts to delete, reparent, or export in a single action.
- **Data portability** — multiple named knowledge bases (each a SQLite file), full JSON import/export, and Markdown export.

---

## 🖼️ Demo

*(Add screenshots here once you create them)*

> Example: Main graph view with nodes, edges, and detail panel.

---

## 📦 Setup

```bash
cd brainforest
python -m venv .venv

# Windows:
.venv\Scripts\activate

# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

---

## License

[MIT](LICENSE) © 2026 Kerekes Stefan