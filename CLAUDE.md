# Brainforest

Personal knowledge base with an interactive DAG knowledge graph + streaming AI chat.
FastAPI + SQLite + vanilla JS; AI backend is DeepSeek (OpenAI-compatible).

## Run

```bash
.venv\Scripts\activate        # Windows
python app.py                 # main app -> http://localhost:8000
python followup_questions.py  # standalone follow-up-question tool -> http://localhost:8001
```

Config lives in `.env` (DEEPSEEK_API_KEY, optional DEEPSEEK_MODEL/DEEPSEEK_BASE_URL/PORT).
No API key or no valid response falls back gracefully per-endpoint; translations fail soft.

## File map

- `app.py` — FastAPI backend, all routes. ~1400 lines.
- `db.py` — SQLite layer. `thoughts`/`links`/`settings`/`comments` + FTS5 index `thoughts_fts`.
- `deepseek_client.py` — DeepSeek client: `stream_chat` (SSE chat, max_tokens 2048) and `chat_json` (JSON-object mode, max_tokens 1024). Both accept a `max_tokens` override.
- `kb_registry.py` — multi-KB switching (each KB is its own SQLite file under `knowledge_bases/`).
- `followup_questions.py` — standalone app; has a large inline `HTML_PAGE` string (~400 lines) — skip reading it unless editing that app.
- `static/` — frontend: `index.html`, `style.css`, and **`app.js` (~127 KB)**.

## Architecture notes

- **Bilingual**: English is primary (`title`/`content`), Romanian in `title_ro`/`content_ro`.
  `_display_title`/`_kb_text` return the language matched to the `language` setting. Always store English as primary regardless of UI language.
- **LLM context retrieval**: endpoints use `db.fts_search(text, limit)` (BM25) via `_retrieve()` in app.py to send only the top relevant thoughts to the model — do NOT reintroduce full-KB dumps (old code sent up to 300 thoughts/call).
- **Settings**: `db.settings` table + env overrides via `resolve_settings()`. Defaults in `db.SETTING_DEFAULTS` (`thinking` off, `auto_translate` on).
- FTS index is kept in sync by triggers; `init_db()` recreates the triggers and backfills on boot.
- `_ensure_bilingual` auto-translates on thought create; batch `/api/translate-titles` and `/api/translate-content` also exist.

## Frontend note

`static/app.js` is very large. Read it in targeted ranges or grep for the section you need rather than reading the whole file (it's ~30k tokens). Use it via the endpoints in `app.py`.

## Conventions

- No framework on the frontend; DOM built by string templates in app.js.
- Romanian diacritics appear throughout; run Python with `PYTHONIOENCODING=utf-8` when printing to the Windows console.
