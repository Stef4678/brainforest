"""Knowledge Brain — FastAPI backend.

Run with:  python app.py
Then open: http://localhost:8000
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
import deepseek_client
import kb_registry

# override=True so a key set in .env wins over a stale DEEPSEEK_API_KEY
# that may already be in the user's environment.
load_dotenv(override=True)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


async def _set_current_kb():
    """Set the active DB path (via contextvar) to the current KB and ensure its schema.

    Async so it runs on the event loop: the contextvar then propagates to both
    async endpoints (same context) and sync endpoints (anyio copies the context
    into the threadpool)."""
    kb_registry.ensure_registry()
    db.set_db_path(kb_registry.current_path())
    db.init_db()


app = FastAPI(title="Knowledge Brain", dependencies=[Depends(_set_current_kb)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ models

class KbNameIn(BaseModel):
    name: str


# ------------------------------------------------------------------ helpers

def resolve_settings():
    stored = db.get_settings()
    env = os.environ
    if env.get("DEEPSEEK_API_KEY"):
        stored["api_key"] = env["DEEPSEEK_API_KEY"]
    if env.get("DEEPSEEK_MODEL"):
        stored["model"] = env["DEEPSEEK_MODEL"]
    if env.get("DEEPSEEK_BASE_URL"):
        stored["base_url"] = env["DEEPSEEK_BASE_URL"]
    return stored


def _setting_bool(value) -> bool:
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _lang() -> str:
    return "ro" if db.get_settings().get("language") == "ro" else "en"


def _lang_instruction() -> str:
    if _lang() == "ro":
        return ("All text you return must be in Romanian — including titles, summaries, "
                "reasons, and questions, even inside JSON fields. ")
    return ""


def _display_title(t) -> str:
    if _lang() == "ro" and t.get("title_ro"):
        return t["title_ro"]
    return t["title"]


def _kb_text(t) -> str:
    if _lang() == "ro" and t.get("content_ro"):
        return t["content_ro"]
    return t.get("content") or ""


async def _ensure_bilingual(title: str, content: str):
    """Return (title, content, title_ro, content_ro) with ENGLISH always primary.

    Detects whether the input is English or Romanian and fills in the other
    language, so `title`/`content` are always English and `title_ro`/`content_ro`
    always Romanian. Falls back to (title, content, "", "") on any failure."""
    settings = resolve_settings()
    messages = [
        {
            "role": "system",
            "content": (
                "You are given a knowledge-base thought's title and content, which "
                "may be written in English or Romanian. Detect the language and "
                "provide both an English and a Romanian version. Return JSON "
                'exactly of the form: {"language": "en" or "ro", "title_en": '
                '"...", "content_en": "...", "title_ro": "...", "content_ro": "..."}'
            ),
        },
        {
            "role": "user",
            "content": f"Title: {title}\n\nContent:\n{content}",
        },
    ]
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.3,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
        if not isinstance(result, dict):
            return title, content, "", ""
        if result.get("language") == "ro":
            return (
                (result.get("title_en") or "").strip() or title,
                (result.get("content_en") or "").strip() or content,
                (result.get("title_ro") or "").strip() or title,
                (result.get("content_ro") or "").strip() or content,
            )
        return (
            title,
            content,
            (result.get("title_ro") or "").strip(),
            (result.get("content_ro") or "").strip(),
        )
    except Exception:
        return title, content, "", ""


# ------------------------------------------------------------------ models

class ThoughtIn(BaseModel):
    title: str
    content: str = ""
    parent_ids: list[int] = []
    title_ro: str = ""
    content_ro: str = ""
    skip_translate: bool = False
    source: str = ""
    question_type: str = ""


class ThoughtUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    title_ro: str | None = None
    content_ro: str | None = None


class LinkIn(BaseModel):
    parent_id: int
    child_id: int


class ChatIn(BaseModel):
    prompt: str
    context_thought_id: int | None = None


class SuggestLinkIn(BaseModel):
    title: str
    content: str
    prompt: str | None = None


class SuggestTitleIn(BaseModel):
    title: str
    content: str


class ConnectionsIn(BaseModel):
    max_suggestions: int | None = None


class CommentIn(BaseModel):
    text: str


class GenerateRelatedIn(BaseModel):
    type: str


class SemanticSearchIn(BaseModel):
    query: str


class SettingsIn(BaseModel):
    model: str | None = None
    temperature: str | None = None
    thinking: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    language: str | None = None


# ------------------------------------------------------------------ thoughts

@app.get("/api/thoughts")
def list_thoughts():
    return db.list_thoughts()


@app.get("/api/thoughts/{thought_id}")
def thought_detail(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    return thought


@app.post("/api/thoughts")
async def create_thought(body: ThoughtIn):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    content = body.content
    title_ro = body.title_ro.strip()
    content_ro = body.content_ro.strip()
    if (
        not body.skip_translate
        and not title_ro
        and _setting_bool(db.get_settings().get("auto_translate", "true"))
    ):
        # Always store English as primary, regardless of the current UI language.
        title, content, title_ro, content_ro = await _ensure_bilingual(title, content)
    try:
        return db.create_thought(
            title, content, body.parent_ids,
            title_ro=title_ro, content_ro=content_ro, source=body.source,
            question_type=body.question_type,
        )
    except db.DuplicateTitleError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"A thought titled \"{exc.title}\" already exists.",
                "existing_id": exc.existing_id,
            },
        )


@app.put("/api/thoughts/{thought_id}")
def update_thought(thought_id: int, body: ThoughtUpdate):
    if db.get_thought(thought_id) is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    try:
        return db.update_thought(
            thought_id,
            title=body.title,
            content=body.content,
            title_ro=body.title_ro,
            content_ro=body.content_ro,
        )
    except db.DuplicateTitleError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"A thought titled \"{exc.title}\" already exists.",
                "existing_id": exc.existing_id,
            },
        )


@app.delete("/api/thoughts/{thought_id}")
def delete_thought(thought_id: int, cascade: bool = False):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    if thought["children"] and not cascade:
        raise HTTPException(
            status_code=409,
            detail="This thought has children. Delete them first, or use ?cascade=true.",
        )
    db.delete_thought(thought_id, cascade=cascade)
    return {"ok": True}


# ------------------------------------------------------------------ links

@app.post("/api/links")
def create_link(body: LinkIn):
    try:
        return db.create_link(body.parent_id, body.child_id)
    except db.LinkCycleError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.delete("/api/links/{link_id}")
def remove_link(link_id: int):
    db.delete_link(link_id)
    return {"ok": True}


# ------------------------------------------------------------------ graph

@app.get("/api/graph")
def graph():
    return db.get_graph()


# ------------------------------------------------------------------ chat

def _build_messages(prompt: str, context_thought_id: int | None):
    messages = [{"role": "system", "content": _lang_instruction() + (
        "You are a thoughtful assistant helping the user build a personal "
        "knowledge base where ideas are connected as thoughts (parents, children, "
        "siblings). Answer clearly and conversationally. Use Markdown when helpful."
    )}]
    if context_thought_id is not None:
        thought = db.get_thought(context_thought_id)
        if thought:
            context = f"The user is currently working on the thought:\n\nTitle: {_display_title(thought)}"
            content = _kb_text(thought)
            if content:
                context += f"\n\nContent:\n{content}"
            context += "\n\nUse this thought as context for your answer when relevant."
            messages.append({"role": "system", "content": context})
    messages.append({"role": "user", "content": prompt})
    return messages


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/chat")
async def chat(body: ChatIn):
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    settings = resolve_settings()
    messages = _build_messages(prompt, body.context_thought_id)

    async def event_stream():
        try:
            async for chunk in deepseek_client.stream_chat(
                messages,
                model=settings["model"],
                temperature=float(settings["temperature"]),
                thinking=_setting_bool(settings["thinking"]),
                api_key=settings["api_key"],
                base_url=settings["base_url"],
            ):
                if chunk["type"] == "delta":
                    yield _sse("delta", {"content": chunk["content"]})
                elif chunk["type"] == "reasoning":
                    yield _sse("reasoning", {"content": chunk["content"]})
            yield _sse("done", {})
        except deepseek_client.ApiKeyError as exc:
            yield _sse("error", {"message": str(exc)})
        except deepseek_client.DeepSeekError as exc:
            yield _sse("error", {"message": str(exc)})
        except Exception as exc:  # keep the connection from dying silently
            yield _sse("error", {"message": f"Unexpected error: {exc}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/chat/suggest-link")
async def suggest_link(body: SuggestLinkIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="No content to place in the knowledge base")

    thoughts = db.list_thoughts()
    kb_lines = []
    for t in thoughts[:300]:
        snippet = " ".join((_kb_text(t) or "").split())
        kb_lines.append(f"- id {t['id']}: {t['title']}" + (f" | {snippet[:150]}" if snippet else ""))

    user_parts = [
        f"The new thought is:\nTitle: {body.title}\nContent:\n{content}",
    ]
    if body.prompt:
        user_parts.append(f"It came from this chat prompt: {body.prompt}")
    user_parts.append(
        "Choose the best existing thought to be its parent, or null for a new root "
        "thought if nothing fits."
    )
    user_parts.append("Existing thoughts:\n" + ("\n".join(kb_lines) if kb_lines else "(none)"))

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You are organizing a personal knowledge base where thoughts form a "
                "tree: each thought has a parent (or is a root). Given a new thought "
                "and a list of existing thoughts, decide where it best belongs. Return "
                "JSON exactly of the form: "
                '{"parent_id": <an existing thought id or null>, "reason": "..."} '
                "The reason is one or two sentences explaining the choice. If no "
                "existing thought is a good fit, return parent_id null to make it a "
                "new root thought."
            ),
        },
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.4,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    reason = (result.get("reason") if isinstance(result, dict) else None) or ""
    existing_ids = {t["id"] for t in thoughts}
    raw_parent = result.get("parent_id") if isinstance(result, dict) else None
    parent_id = raw_parent if isinstance(raw_parent, int) and raw_parent in existing_ids else None

    parent_title = None
    if parent_id is not None:
        parent = db.get_thought(parent_id)
        parent_title = parent["title"] if parent else None

    return {
        "parent_id": parent_id,
        "parent_title": parent_title,
        "reason": reason,
    }


@app.post("/api/chat/suggest-title")
async def suggest_title_for_content(body: SuggestTitleIn):
    title = body.title.strip()
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="No content to title")

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You help title a new thought in a personal knowledge base. The "
                "current title may contain conversational filler or clutter, while "
                "the real subject is shorter and clearer. Suggest 3 to 5 cleaner, "
                "more descriptive titles that capture the subject concisely. Return "
                'JSON exactly of the form: {"suggestions": [{"title": "...", '
                '"reason": "..."}]} The reason is a short one-line explanation of '
                "the change."
            ),
        },
        {
            "role": "user",
            "content": f"Current title: {title or '(none)'}\n\nContent:\n{content}",
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.4,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    raw = result.get("suggestions") if isinstance(result, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of suggestions")

    clean = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        t = (item.get("title") or "").strip()
        reason = (item.get("reason") or "").strip()
        if t:
            clean.append({"title": t, "reason": reason})
    return {"suggestions": clean}


@app.post("/api/connections")
async def find_connections(body: ConnectionsIn):
    graph = db.get_graph()
    nodes, edges = graph["nodes"], graph["edges"]
    if not nodes:
        raise HTTPException(status_code=400, detail="No thoughts to connect")

    thought_lines = []
    for t in nodes[:300]:
        snippet = " ".join((_kb_text(t) or "").split())
        thought_lines.append(
            f"- id {t['id']}: {t['title']}" + (f" | {snippet[:150]}" if snippet else "")
        )
    link_lines = [
        f"- {e['parent_id']} -> {e['child_id']}"
        for e in edges[:400]
    ]
    existing_desc = "\n".join(link_lines) if link_lines else "(none)"

    max_n = body.max_suggestions or 8
    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You analyze a personal knowledge base to find new, meaningful "
                "relationships between existing thoughts. A thought can have a "
                "parent and children, forming a tree (a child belongs under one "
                "parent). Suggest NEW parent -> child links that are not already "
                f"in the graph and that make sense, up to {max_n} suggestions. "
                "Return JSON exactly of the form: "
                '{"connections": [{"parent_id": <existing id>, "child_id": '
                '<existing id>, "reason": "..."}]} The reason is 1-2 sentences '
                "explaining why the child belongs under that parent."
            ),
        },
        {
            "role": "user",
            "content": (
                "Thoughts:\n" + "\n".join(thought_lines)
                + "\n\nExisting links:\n" + existing_desc
            ),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.4,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    raw = result.get("connections") if isinstance(result, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of connections")

    titles = {t["id"]: t["title"] for t in nodes}
    connections = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        parent_id = item.get("parent_id")
        child_id = item.get("child_id")
        reason = (item.get("reason") or "").strip()
        if not isinstance(parent_id, int) or not isinstance(child_id, int):
            continue
        ok, _ = db.validate_link(parent_id, child_id)
        if not ok:
            continue
        connections.append({
            "parent_id": parent_id,
            "parent_title": titles.get(parent_id),
            "child_id": child_id,
            "child_title": titles.get(child_id),
            "reason": reason,
        })

    return {"connections": connections}


@app.post("/api/thoughts/{thought_id}/extract")
async def extract_ideas(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    if not thought["content"].strip():
        raise HTTPException(
            status_code=400,
            detail="This thought has no content to extract ideas from.",
        )

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You extract the key ideas from a piece of writing and return them "
                "as JSON. Extract 3 to 8 distinct, meaningful ideas. Each idea has "
                "a short title (at most 8 words) and a 1-2 sentence summary written "
                "in your own words based only on the given text. Respond with only "
                "a JSON object of the form: "
                '{"ideas": [{"title": "...", "summary": "..."}]}'
            ),
        },
        {
            "role": "user",
            "content": f"Title: {_display_title(thought)}\n\nContent:\n{_kb_text(thought)}",
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=float(settings["temperature"]),
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    ideas = result.get("ideas") if isinstance(result, dict) else None
    if not isinstance(ideas, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of ideas")

    clean = []
    for idea in ideas:
        if not isinstance(idea, dict):
            continue
        title = (idea.get("title") or "").strip()
        summary = (idea.get("summary") or "").strip()
        if title:
            clean.append({"title": title, "summary": summary})
    return {"ideas": clean}


@app.post("/api/thoughts/{thought_id}/suggest-title")
async def suggest_title(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You help improve the title of a thought in a personal knowledge "
                "base. The current title may contain conversational filler or "
                "clutter (for example 'Here is a solid overview to help you frame "
                "\"X\"'), while the real subject is shorter and clearer. Suggest 3 "
                "to 5 cleaner, more descriptive titles that capture the subject "
                "concisely. Return JSON exactly of the form: "
                '{"suggestions": [{"title": "...", "reason": "..."}]} The reason '
                "is a short one-line explanation of the change."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Current title: {_display_title(thought)}\n\n"
                f"Content:\n{_kb_text(thought)}"
            ),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.4,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    raw = result.get("suggestions") if isinstance(result, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of suggestions")

    clean = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        reason = (item.get("reason") or "").strip()
        if title:
            clean.append({"title": title, "reason": reason})
    return {"suggestions": clean}


@app.post("/api/thoughts/{thought_id}/reanalyze")
async def reanalyze_children(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")

    children = thought["children"]
    child_ids = {c["id"] for c in children}
    all_thoughts = db.list_thoughts()
    others = [
        t for t in all_thoughts
        if t["id"] != thought_id and t["id"] not in child_ids
    ]

    def line(t):
        snippet = " ".join((_kb_text(t) or "").split())
        return f"- id {t['id']}: {t['title']}" + (f" | {snippet[:150]}" if snippet else "")

    children_lines = [line(c) for c in children]
    others_lines = [line(t) for t in others]

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You analyze a parent thought and its children in a knowledge "
                "base. Determine two things. (1) Whether each current child truly "
                "belongs under this parent; if a child fits better under another "
                "existing thought, flag it as misplaced and name the better "
                "parent. (2) Which other existing thoughts would fit well as new "
                "children of this parent. Return JSON exactly of the form: "
                '{"misplaced": [{"child_id": <id>, "suggested_parent_id": <id>, '
                '"reason": "..."}], "new_children": [{"child_id": <id>, "reason": '
                '"..."}]} Each reason is one or two sentences. Only reference ids '
                "that appear in the provided lists."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Parent thought (id {thought_id}):\n"
                f"Title: {_display_title(thought)}\nContent:\n{_kb_text(thought)}"
                "\n\nCurrent children:\n" + ("\n".join(children_lines) if children_lines else "(none)")
                + "\n\nOther thoughts:\n" + ("\n".join(others_lines) if others_lines else "(none)")
            ),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.4,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = result if isinstance(result, dict) else {}
    titles = {t["id"]: t["title"] for t in all_thoughts}

    misplaced = []
    for item in result.get("misplaced") or []:
        if not isinstance(item, dict):
            continue
        child_id = item.get("child_id")
        new_parent_id = item.get("suggested_parent_id")
        reason = (item.get("reason") or "").strip()
        if not isinstance(child_id, int) or not isinstance(new_parent_id, int):
            continue
        if child_id not in child_ids:
            continue  # must be a current child
        if new_parent_id == thought_id or new_parent_id == child_id:
            continue
        ok, _ = db.validate_link(new_parent_id, child_id)
        if not ok:
            continue
        misplaced.append({
            "child_id": child_id,
            "child_title": titles.get(child_id),
            "suggested_parent_id": new_parent_id,
            "suggested_parent_title": titles.get(new_parent_id),
            "reason": reason,
        })

    new_children = []
    for item in result.get("new_children") or []:
        if not isinstance(item, dict):
            continue
        child_id = item.get("child_id")
        reason = (item.get("reason") or "").strip()
        if not isinstance(child_id, int):
            continue
        if child_id in child_ids or child_id == thought_id:
            continue  # must not already be a child
        ok, _ = db.validate_link(thought_id, child_id)
        if not ok:
            continue
        new_children.append({
            "child_id": child_id,
            "child_title": titles.get(child_id),
            "reason": reason,
        })

    return {"misplaced": misplaced, "new_children": new_children}


# -------------------------------------------------------- generate related

RELATED_TYPES = ("children", "siblings", "parents")


@app.post("/api/thoughts/{thought_id}/generate-related")
async def generate_related(thought_id: int, body: GenerateRelatedIn):
    rtype = body.type
    if rtype not in RELATED_TYPES:
        raise HTTPException(status_code=400, detail="type must be children, siblings, or parents")
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    if rtype == "siblings" and not thought["parents"]:
        raise HTTPException(status_code=400, detail="This thought has no parent, so it has no siblings")

    all_thoughts = db.list_thoughts()
    existing_titles = {t["title"].strip().lower() for t in all_thoughts}
    existing_lines = "\n".join(
        f"- {t['title']}" for t in all_thoughts[:200]
    ) or "(none)"

    if rtype == "children":
        task = (
            "Generate 3 to 6 subtopics or key ideas that expand this thought, "
            "things that would be natural children of it."
        )
    elif rtype == "siblings":
        task = (
            "Generate 3 to 5 related thoughts that belong under the SAME parent "
            "as this thought - same topic area but distinct from it."
        )
    else:
        task = (
            "Generate 1 to 3 broader concepts that this thought belongs under "
            "(its natural parents)."
        )

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You help grow a personal knowledge base. Each idea has a short "
                "title (at most 8 words) and a 1-2 sentence summary. Do NOT repeat "
                "or duplicate any existing thought title. Return JSON exactly of "
                'the form: {"ideas": [{"title": "...", "summary": "..."}]}'
            ),
        },
        {
            "role": "user",
            "content": (
                f"Thought:\nTitle: {_display_title(thought)}\nContent:\n{_kb_text(thought)}"
                + (f"\n\nIts parent:\n{_display_title(thought['parents'][0])}" if rtype == "siblings" else "")
                + f"\n\n{task}\n\nExisting thought titles (avoid these):\n{existing_lines}"
            ),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.5,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    raw = result.get("ideas") if isinstance(result, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of ideas")

    seen = set()
    ideas = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        summary = (item.get("summary") or "").strip()
        key = title.lower()
        if not title or key in existing_titles or key in seen:
            continue
        seen.add(key)
        ideas.append({"title": title, "summary": summary})
    return {"ideas": ideas}


@app.post("/api/thoughts/{thought_id}/generate-content")
async def generate_content(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")

    def ctx_lines(items):
        return "\n".join(f"- {_display_title(x)}" for x in items) or "(none)"

    user_parts = [
        f"Thought:\nTitle: {_display_title(thought)}",
    ]
    content = _kb_text(thought)
    if content:
        user_parts.append(f"Current content:\n{content}")
    user_parts.extend([
        "\nWhere it sits in the knowledge base:",
        f"Parents:\n{ctx_lines(thought['parents'])}",
        f"Children:\n{ctx_lines(thought['children'])}",
        f"Siblings:\n{ctx_lines(thought['siblings'])}",
    ])

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "Write a concise but substantive description of a thought in a "
                "personal knowledge base, fitting where it sits in the graph "
                "(its parents, children, siblings). Write in your own words, 2 to "
                "4 short paragraphs or natural bullet points, Markdown-friendly. "
                "Return JSON exactly of the form: "
                '{"content_en": "...", "content_ro": "..."} with the same text in '
                "English and Romanian."
            ),
        },
        {"role": "user", "content": "\n".join(user_parts)},
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.5,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = result if isinstance(result, dict) else {}
    content_en = (result.get("content_en") or "").strip()
    content_ro = (result.get("content_ro") or "").strip()
    if not content_en and not content_ro:
        raise HTTPException(status_code=502, detail="DeepSeek did not return content")
    if not content_en:
        content_en = content_ro
    if not content_ro:
        content_ro = content_en
    return {"content_en": content_en, "content_ro": content_ro}


# ------------------------------------------------------------ translation

@app.post("/api/translate-titles")
async def translate_titles():
    thoughts = db.list_thoughts()
    pending = [t for t in thoughts if not (t.get("title_ro") or "").strip()]
    if not pending:
        return {"updated": 0}

    pending = pending[:300]
    lines = [f"- id {t['id']}: {t['title']}" for t in pending]
    messages = [
        {
            "role": "system",
            "content": (
                "Translate each of these knowledge-base thought titles from English "
                "to Romanian. Keep each translation concise and natural. Return "
                "JSON exactly of the form: "
                '{"translations": {"<id>": "<romanian title>"}} '
                "with a key for every id listed."
            ),
        },
        {"role": "user", "content": "\n".join(lines)},
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.3,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    translations = result.get("translations") if isinstance(result, dict) else None
    if not isinstance(translations, dict):
        raise HTTPException(status_code=502, detail="DeepSeek did not return translations")

    updated = 0
    for t in pending:
        ro = (translations.get(str(t["id"])) or "").strip()
        if ro:
            db.update_thought(t["id"], title_ro=ro)
            updated += 1
    return {"updated": updated}


@app.post("/api/translate-content")
async def translate_content():
    import asyncio

    thoughts = db.list_thoughts()
    pending = [
        t for t in thoughts
        if not (t.get("content_ro") or "").strip() and (t.get("content") or "").strip()
    ]
    if not pending:
        return {"updated": 0}

    pending = pending[:300]
    settings = resolve_settings()
    sem = asyncio.Semaphore(5)

    async def translate_one(t):
        messages = [
            {
                "role": "system",
                "content": (
                    "Translate a knowledge-base thought's content from English to "
                    "Romanian. Keep the meaning and any structure. Return JSON "
                    'exactly of the form: {"content_ro": "..."}'
                ),
            },
            {
                "role": "user",
                "content": f"Title: {t['title']}\n\nContent:\n{t['content']}",
            },
        ]
        async with sem:
            try:
                result = await deepseek_client.chat_json(
                    messages,
                    model=settings["model"],
                    temperature=0.3,
                    api_key=settings["api_key"],
                    base_url=settings["base_url"],
                )
            except deepseek_client.ApiKeyError:
                raise
            except deepseek_client.DeepSeekError:
                return None
        ro = (result.get("content_ro") or "").strip() if isinstance(result, dict) else ""
        return (t["id"], ro) if ro else None

    try:
        results = await asyncio.gather(*(translate_one(t) for t in pending))
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    updated = 0
    for item in results:
        if item is None:
            continue
        thought_id, ro = item
        db.update_thought(thought_id, content_ro=ro)
        updated += 1
    return {"updated": updated}


@app.post("/api/thoughts/{thought_id}/followups")
async def followups(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "Given a thought in a personal knowledge base, suggest follow-up "
                "questions the user could ask in a chat about this thought. Return "
                "SIX groups, each with exactly 2 short questions, as JSON of the "
                "form: {\"scientific\": [\"...\", \"...\"], \"practical\": [\"...\", "
                "\"...\"], \"comparative\": [\"...\", \"...\"], \"historical\": "
                "[\"...\", \"...\"], \"causal\": [\"...\", \"...\"], \"critical\": "
                "[\"...\", \"...\"]}. Group styles: scientific explores the topic "
                "deeper and conceptually; practical is simple, everyday and "
                "actionable (concrete real-life application); comparative compares "
                "this thought with related or opposite concepts; historical asks "
                "how this idea evolved and what influenced it over time; causal "
                "asks what causes this and what its consequences are; critical "
                "raises the strongest objections, counterarguments, or weaknesses."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Title: {_display_title(thought)}\n\nContent:\n{_kb_text(thought)}"
            ),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.5,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = result if isinstance(result, dict) else {}

    GROUPS = ["scientific", "practical", "comparative", "historical", "causal", "critical"]

    def clean_group(key):
        raw = result.get(key)
        if not isinstance(raw, list):
            return []
        return [str(q).strip() for q in raw if str(q).strip()][:2]

    out = {key: clean_group(key) for key in GROUPS}
    if not any(out.values()):
        raise HTTPException(status_code=502, detail="DeepSeek did not return questions")

    return out


# ------------------------------------------------------------- comments

@app.get("/api/thoughts/{thought_id}/comments")
def get_comments(thought_id: int):
    if db.get_thought(thought_id) is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    return db.list_comments(thought_id)


@app.post("/api/thoughts/{thought_id}/comments")
def post_comment(thought_id: int, body: CommentIn):
    if db.get_thought(thought_id) is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    comment_id = db.add_comment(thought_id, text)
    return {"id": comment_id}


@app.delete("/api/comments/{comment_id}")
def remove_comment(comment_id: int):
    if not db.delete_comment(comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"ok": True}


# ------------------------------------------------------------------ settings

@app.get("/api/settings")
def get_settings():
    settings = resolve_settings()
    return {
        "model": settings["model"],
        "temperature": settings["temperature"],
        "thinking": settings["thinking"],
        "base_url": settings["base_url"],
        "api_key_set": bool(settings["api_key"]),
        "language": settings["language"],
    }


@app.put("/api/settings")
def put_settings(body: SettingsIn):
    values = {k: v for k, v in body.model_dump().items() if v is not None}
    db.save_settings(values)
    return get_settings()


# -------------------------------------------------------------- knowledge bases

def _kb_list_payload():
    return {
        "bases": kb_registry.list_bases(),
        "current": kb_registry.get_current(),
        "count": db.thought_count(),
    }


@app.get("/api/kbs")
def list_kbs():
    return _kb_list_payload()


@app.post("/api/kbs")
def create_kb(body: KbNameIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    try:
        path = kb_registry.create_base(name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    # The dependency already set the old path; set the new one for this request
    # and ensure the fresh DB has a schema.
    db.set_db_path(path)
    db.init_db()
    return _kb_list_payload()


@app.put("/api/kbs/current")
def switch_kb(body: KbNameIn):
    name = body.name.strip()
    try:
        path = kb_registry.path_for(name)
    except KeyError:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    kb_registry.set_current(name)
    db.set_db_path(path)
    db.init_db()
    return _kb_list_payload()


@app.post("/api/kbs/{name}/rename")
def rename_kb(name: str, body: KbNameIn):
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")
    try:
        kb_registry.rename_base(name, new_name)
    except KeyError:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return _kb_list_payload()


@app.delete("/api/kbs/{name}")
def delete_kb(name: str):
    try:
        kb_registry.delete_base(name)
    except KeyError:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Point the thread-local back at the new current KB.
    db.set_db_path(kb_registry.current_path())
    return _kb_list_payload()


@app.post("/api/kbs/clear")
def clear_kb():
    db.clear_base()
    return _kb_list_payload()


# ------------------------------------------------------------------ stats

@app.get("/api/stats")
def stats():
    thoughts = db.list_thoughts()
    by_source = {}
    for t in thoughts:
        src = t.get("source") or "unknown"
        by_source[src] = by_source.get(src, 0) + 1
    # Follow-up question types; thoughts without a known type go to "untyped".
    QUESTION_TYPES = ("scientific", "practical", "comparative", "historical", "causal", "critical")
    by_question_type = {}
    for t in thoughts:
        qtype = (t.get("question_type") or "").strip().lower()
        if qtype not in QUESTION_TYPES:
            qtype = "untyped"
        by_question_type[qtype] = by_question_type.get(qtype, 0) + 1
    return {"total": len(thoughts), "by_source": by_source, "by_question_type": by_question_type}


# ------------------------------------------------------------------ search

@app.get("/api/search")
def search_exact(q: str = ""):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")
    # escape LIKE wildcards, keep the query literal
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    conn = db._connect()
    try:
        rows = conn.execute(
            "SELECT id, title, title_ro, content, content_ro FROM thoughts "
            "WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' "
            "ORDER BY title LIMIT 30",
            (pattern, pattern),
        ).fetchall()
    finally:
        conn.close()
    return {"results": [dict(r) for r in rows]}


@app.post("/api/search/semantic")
async def search_semantic(body: SemanticSearchIn):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    thoughts = db.list_thoughts()
    lines = []
    for t in thoughts[:300]:
        snippet = " ".join((_kb_text(t) or "").split())
        lines.append(f"- id {t['id']}: {t['title']}" + (f" | {snippet[:150]}" if snippet else ""))

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You search a personal knowledge base. Given a user query and a "
                "list of thoughts, return up to 8 thoughts most relevant to the "
                "query, ranked best first. Include thoughts that match the query's "
                "meaning or synonyms even if the exact words differ. Each match "
                "has a one-line reason. If nothing is relevant, return an empty "
                "list. Return JSON exactly of the form: "
                '{"matches": [{"id": <existing id>, "reason": "..."}]}'
            ),
        },
        {
            "role": "user",
            "content": f"Query: {query}\n\nThoughts:\n" + ("\n".join(lines) if lines else "(none)"),
        },
    ]

    settings = resolve_settings()
    try:
        result = await deepseek_client.chat_json(
            messages,
            model=settings["model"],
            temperature=0.3,
            api_key=settings["api_key"],
            base_url=settings["base_url"],
        )
    except deepseek_client.ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except deepseek_client.DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    raw = result.get("matches") if isinstance(result, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="DeepSeek did not return a list of matches")

    titles = {t["id"]: t for t in thoughts}
    seen = set()
    results = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        tid = item.get("id")
        reason = (item.get("reason") or "").strip()
        if not isinstance(tid, int) or tid not in titles or tid in seen:
            continue
        seen.add(tid)
        results.append({
            "id": tid,
            "title": titles[tid]["title"],
            "title_ro": titles[tid].get("title_ro", ""),
            "reason": reason,
        })
    return {"results": results}


# ------------------------------------------------------------------ export

@app.get("/api/export")
def export_kb():
    return db.export_kb()


@app.post("/api/import")
def import_kb(graph_data: dict):
    if "nodes" not in graph_data or "edges" not in graph_data:
        raise HTTPException(
            status_code=400, detail="Expected JSON with 'nodes' and 'edges' arrays"
        )
    return db.import_kb(graph_data)


# ------------------------------------------------------------------ static

class NoCacheStaticFiles(StaticFiles):
    # Dev only: revalidate static assets every request so edited JS/CSS is
    # never served stale from the browser's heuristic cache.
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


def main():
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    print(f"Knowledge Brain running at http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
