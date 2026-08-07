# Knowledge Brain
### AI-Powered Knowledge Management System

> A personal knowledge base with an interactive knowledge graph (DAG of linked thoughts) + streaming AI chat — built with FastAPI, SQLite, and vanilla JS.

---

## 🧠 Project Pitch

**Knowledge Brain** is a self-hosted, interactive knowledge management application that visualizes your thoughts as a tree (each thought has one parent, enforced with cycle detection). It combines structured knowledge representation with an integrated AI chat (DeepSeek V4 Flash), letting you build, explore, and query a personal "second brain."

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

- **Knowledge graph** — thoughts as nodes in an interactive, zoomable graph. A thought can have multiple parents (a DAG). Siblings are thoughts that share a parent.
- **Chat with DeepSeek** — ask questions, optionally attach the selected thought as context, and get streamed Markdown answers from `deepseek-v4-flash`.
- **Manual saving** — save a chat response as a _child_ of your selection, a _sibling_, or a _new root_ thought.
- **Editing** — add/rename/delete thoughts, create parent → child links between any two thoughts, choose graph layouts, and export/import your whole knowledge base as JSON.

---

## 🖼️ Demo

*(Add screenshots here once you create them)*

> Example: Main graph view with nodes, edges, and detail panel.

---

## 📦 Setup

1. Clone the repository and navigate into it:

```bash
cd knowledge_brain
```

2. Create and activate a virtual environment:

```bash
python -m venv .venv
```

```bash
# Windows:
.venv\Scripts\activate

# macOS / Linux:
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Get an API key from [https://platform.deepseek.com/](https://platform.deepseek.com/).

5. Copy the example environment file:

```bash
cp .env.example .env
```

6. Edit `.env` and set your API key:

```
DEEPSEEK_API_KEY=sk-your-actual-key-here
```

> **Note:** You can also paste the key in the app's **Settings** dialog instead — the `.env` value takes priority if both are set.

---

## 🚀 Running the Application

Start the server:

```bash
python app.py
```

Then open your browser and navigate to:

```
http://localhost:8000
```

---

## 📖 How to Use

**Creating thoughts**

Click **＋ New thought** (or **＋ Add child** in the detail panel). Give your thought a title and optional content.

**Linking thoughts**

Ctrl-click two nodes to select them, then click **Link parent→child**. The first node you selected becomes the parent. The system will reject any link that would create a cycle.

**Chatting with AI**

Tick the **Use selected thought as context** checkbox, type your prompt, and press Enter. The response streams in real-time. Click **Save as thought** to add the AI's response directly to your knowledge base.

**Exploring your graph**

Select any node to see its parents, children, and siblings in the right panel. Choose a layout from the toolbar: Organic, Hierarchy, Concentric or Cascading.

---

## 📡 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/graph` | Retrieve all nodes and edges |
| GET | `/api/thoughts` | List all thoughts |
| GET | `/api/thoughts/{id}` | Get a specific thought |
| POST | `/api/thoughts` | Create a new thought |
| PUT | `/api/thoughts/{id}` | Update a thought |
| DELETE | `/api/thoughts/{id}` | Delete a thought (use `?cascade=true` if it has children) |
| POST | `/api/links` | Create a link between thoughts (cycle-checked) |
| DELETE | `/api/links/{id}` | Remove a link |
| POST | `/api/chat` | Stream DeepSeek response (Server-Sent Events) |
| GET | `/api/settings` | Get current settings |
| PUT | `/api/settings` | Update settings (model, temperature, etc.) |
| GET | `/api/export` | Export the entire knowledge base as JSON |
| POST | `/api/import` | Import a knowledge base from JSON |

---

## 📝 Important Notes

- Data is stored in `knowledge_brain.db` (SQLite), which is created automatically on first run.
- The default model is `deepseek-v4-flash`. The legacy `deepseek-chat` model was retired on 2026-07-24 — if you need a different model, change it in the Settings dialog.
- Run `pip install -r requirements.txt` again whenever you pull new changes that update dependencies.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
