"""Knowledge Brain — FastAPI backend.

Run with:  python app.py
Then open: http://localhost:8000
"""

import asyncio
import json
import logging
import mimetypes
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import backup
import db
import deepseek_client
import embeddings
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


@asynccontextmanager
async def lifespan(_app):
    # Prepare the current KB and remove media files orphaned by deletions that
    # raced an in-use (streaming) file handle on Windows.
    kb_registry.ensure_registry()
    db.set_db_path(kb_registry.current_path())
    db.init_db()
    _cleanup_orphan_media()
    # Fail loudly at startup on a corrupt DB rather than silently serving a
    # broken graph.
    db.check_integrity()
    task = asyncio.create_task(_backup_loop())
    asyncio.create_task(_rebuild_consumer())
    try:
        yield
    finally:
        task.cancel()


def _backup_interval_hours() -> int:
    settings = resolve_settings()
    try:
        return max(1, int(settings.get("backup_interval_hours", "24") or 24))
    except ValueError:
        return 24


async def _backup_loop():
    """Snapshot all KBs on a timer while the app runs.

    Runs the first pass shortly after startup (only creating a backup when the
    newest one is stale) so restarts don't spam snapshots, then every
    interval. Config is re-read each tick so setting changes take effect.
    """
    try:
        hours = _backup_interval_hours()
        await asyncio.to_thread(backup.backup_if_stale, hours)
        while True:
            await asyncio.sleep(hours * 3600)
            hours = _backup_interval_hours()
            await asyncio.to_thread(backup.backup_if_stale, hours)
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Knowledge Brain", dependencies=[Depends(_set_current_kb)], lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(sqlite3.OperationalError)
async def _sqlite_error_handler(_request: Request, exc: sqlite3.OperationalError):
    # Most OperationalErrors on a local app mean the disk is full or the DB is
    # locked. SQLite's transaction semantics already rolled the write back, so
    # the only thing lost is this request — surface a clear message instead of
    # a raw "database is locked / disk I/O error".
    logging.error("SQLite error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "The database could not be written (possibly the disk is "
                      "full or the database is busy). No data was lost — your "
                      "latest change was not saved. Free some disk space and "
                      "try again."
        },
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
    if env.get("BACKUP_DIR"):
        stored["backup_dir"] = env["BACKUP_DIR"]
    if env.get("BACKUP_INTERVAL_HOURS"):
        stored["backup_interval_hours"] = env["BACKUP_INTERVAL_HOURS"]
    if env.get("BACKUP_KEEP"):
        stored["backup_keep"] = env["BACKUP_KEEP"]
    if env.get("EMBEDDING_MODEL"):
        stored["embedding_model"] = env["EMBEDDING_MODEL"]
    if env.get("EMBEDDING_ENABLED"):
        stored["embedding_enabled"] = env["EMBEDDING_ENABLED"]
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


def _kb_line(t) -> str:
    """One compact line describing a thought for an LLM context dump."""
    snippet = " ".join((_kb_text(t) or "").split())
    return f"- id {t['id']}: {t['title']}" + (f" | {snippet[:150]}" if snippet else "")


def _retrieve(query: str, limit: int = 20):
    """Top thoughts relevant to a query (local BM25), with a bounded fallback."""
    hits = db.fts_search(query, limit=limit)
    if hits:
        return hits
    return db.list_thoughts()[:limit]


# ------------------------------------------------------------ embeddings

_build_state = {"running": False, "scope": None}
_rebuild_queue = asyncio.Queue()


def _request_rebuild(scope, model):
    if not _build_state["running"]:
        _rebuild_queue.put_nowait((scope, model))


def _embed_text(t) -> str:
    parts = [t.get("title") or "", t.get("title_ro") or "", t.get("content") or "", t.get("content_ro") or ""]
    return "\n".join(p for p in parts if p)[:4000]


def _rebuild_kb(path, model):
    """Sync (threadpool) sweep: embed all active thoughts in a KB, upsert. Never raises."""
    thoughts = db.list_thoughts_in(path)
    if not thoughts:
        return
    vecs = embeddings.embed_texts([_embed_text(t) for t in thoughts], model=model)
    if vecs is None:
        return
    db.save_embeddings_bulk([(t["id"], v) for t, v in zip(thoughts, vecs)], model=model, path=path)


async def _rebuild_consumer():
    while True:
        scope, model = await _rebuild_queue.get()
        _build_state.update(running=True, scope=scope)
        try:
            names = kb_registry.list_bases() if scope == "all" else [kb_registry.get_current()]
            for name in names:
                db.init_db(kb_registry.path_for(name))
                await asyncio.to_thread(_rebuild_kb, kb_registry.path_for(name), model)
        except Exception as exc:
            logging.error("Embedding rebuild failed: %s", exc)
        finally:
            _build_state["running"] = False


def _index_thought(thought):
    """Best-effort write-path hook. Never raises; skips when semantic search is disabled."""
    try:
        settings = resolve_settings()
        if not _setting_bool(settings.get("embedding_enabled", "false")):
            return
        model = settings.get("embedding_model")
        vec = embeddings.embed_one(_embed_text(thought), model=model)
        if vec is not None:
            db.save_embedding(thought["id"], model, len(vec), vec)
    except Exception as exc:
        logging.warning("Indexing thought %s failed: %s", thought.get("id"), exc)


# ------------------------------------------------------------------ media

MEDIA_ROOT = BASE_DIR / "media"


def _media_root() -> Path:
    # One media folder per knowledge base, keyed by the KB's file stem.
    slug = Path(kb_registry.current_path()).stem
    root = MEDIA_ROOT / slug
    root.mkdir(parents=True, exist_ok=True)
    return root


def _media_file_path(media: dict) -> Path:
    root = _media_root().resolve()
    path = (root / media["stored_path"]).resolve()
    if not str(path).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid media path")
    return path


def _remove_file(path: Path, attempts: int = 5, delay: float = 0.4) -> bool:
    """Delete a file, retrying briefly to survive transient Windows locks.

    The server holds video files open while streaming them to the browser, so a
    delete that races playback can hit a locked file. Returns True if the file
    is gone (or never existed), False if it is still locked after the retries."""
    for i in range(attempts):
        try:
            if path.is_file():
                path.unlink()
            return True
        except OSError:
            if i < attempts - 1:
                time.sleep(delay)
    return False


def _cleanup_orphan_media():
    """Delete media files on disk that no longer have a DB row.

    A deletion that races an open streaming handle (video playing in the
    browser) can leave the file behind; the DB row is authoritative, so any
    file not referenced by it is safe to remove. Best-effort on startup."""
    try:
        root = _media_root()
    except Exception:
        return
    if not root.is_dir():
        return
    stored = {m["stored_path"] for m in db.all_media()}
    for path in root.rglob("*"):
        if path.is_file():
            rel = path.relative_to(root).as_posix()
            if rel not in stored:
                _remove_file(path)


_SAFE_FOLDER_RE = re.compile(r"[^A-Za-z0-9 _-]")


def _sanitize_folder(name) -> str:
    name = (name or "").strip().replace("/", " ").replace("\\", " ")
    name = _SAFE_FOLDER_RE.sub("", name)
    name = re.sub(r"\s+", " ", name).strip(" .-_")
    return name if name and len(name) <= 40 else ""


def _folder_fallback(mime: str) -> str:
    if mime.startswith("image/"):
        return "Photos"
    if mime.startswith("video/"):
        return "Videos"
    if mime.startswith("audio/"):
        return "Audio"
    if mime == "application/pdf":
        return "PDFs"
    if mime.startswith("text/") or mime in (
        "application/json",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        return "Documents"
    return "Uncategorized"


def _ext_for(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    return ext if re.fullmatch(r"\.[a-z0-9]{1,8}", ext) else ""


def _mime_type(content_type, filename: str) -> str:
    if content_type:
        ctype = content_type.split(";")[0].strip().lower()
        if ctype.startswith(("image/", "video/", "audio/", "text/", "application/", "model/")):
            return ctype
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


# Codecs browsers can actually decode in a <video> element. mp4v (MPEG-4 Part 2)
# is the common offender that plays audio-only.
_BROWSER_VIDEO_CODECS = {
    "avc1", "avc3", "hvc1", "hev1",  # H.264 / H.265
    "vp09", "av01",                  # VP9 / AV1
    "dvh1", "dvhe",                  # Dolby Vision (HDR H.264/HEVC)
}


def _stsd_sample_formats(body: bytes) -> list[bytes]:
    if len(body) < 16:
        return []
    try:
        count = int.from_bytes(body[4:8], "big")
    except (IndexError, ValueError):
        return []
    out = []
    pos = 8
    for _ in range(count):
        if pos + 8 > len(body):
            break
        size = int.from_bytes(body[pos:pos + 4], "big")
        if size < 8:
            break
        out.append(body[pos + 4:pos + 8])
        pos += size
    return out


_AUDIO_FORMATS = {b"mp4a", b"ac-3", b"ec-3", b"Opus", b"twos", b"sowt", b"samr", b"sawb"}


def _walk_video_codec(data: bytes, start: int, end: int) -> str:
    """Walk a box region for the moov -> trak -> mdia -> minf -> stbl -> stsd
    chain and return the first non-audio sample-entry format (avc1, mp4v, ...)."""
    stack = [(start, end)]
    while stack:
        box_start, box_end = stack.pop()
        off = box_start
        while off + 8 <= box_end:
            size = int.from_bytes(data[off:off + 4], "big")
            typ = data[off + 4:off + 8]
            if size == 1 and off + 16 <= box_end:
                size = int.from_bytes(data[off + 8:off + 16], "big")
            elif size == 0:
                size = box_end - off
            if size < 8:
                break
            if typ == b"stsd":
                for fmt in _stsd_sample_formats(data[off + 8:off + size]):
                    if fmt not in _AUDIO_FORMATS:
                        return fmt.decode("latin1", "replace")
            elif typ in (b"moov", b"trak", b"mdia", b"minf", b"stbl"):
                stack.append((off + 8, off + size))
            off += size
    return ""


def _moov_range(data: bytes):
    """Locate a plausible moov box within a byte chunk that may not start at a
    box boundary (e.g. a slice of the file tail). Returns (start, end) or None."""
    pos = 0
    while True:
        pos = data.find(b"moov", pos)
        if pos < 0:
            return None
        if pos >= 4:
            size = int.from_bytes(data[pos - 4:pos], "big")
            if 8 <= size <= len(data) - (pos - 4):
                return pos - 4, pos - 4 + size
        pos += 1


def _video_codec(path: Path) -> str:
    """Best-effort video track codec detection for mp4/mov (reads up to 16 MB)."""
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            head = f.read(16 * 1024 * 1024)
        if len(head) >= 8 and head[4:8] == b"ftyp":
            codec = _walk_video_codec(head, 0, len(head))
            if codec:
                return codec
        # moov may live at the tail (non-faststart files): scan the last chunk.
        if size > len(head):
            with open(path, "rb") as f:
                f.seek(size - len(head))
                tail = f.read(len(head))
            rng = _moov_range(tail)
            if rng:
                codec = _walk_video_codec(tail, rng[0], rng[1])
                if codec:
                    return codec
        return ""
    except OSError:
        return ""


async def _suggest_folders(files: list[dict], thought_title: str, thought_content: str):
    """Best-effort: one category folder per file (aligned with `files`), or None."""
    lines = [f"- {i}: {f['name']} ({f['mime']})" for i, f in enumerate(files)]
    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You organize media files for a personal knowledge base. Given the "
                "thought they belong to and a numbered list of filenames with their "
                "MIME types, suggest ONE short category folder for each file. Use "
                "simple singular category names like Photos, Screenshots, Diagrams, "
                "Documents, PDFs, Videos, Lectures, Audio, Research, Receipts, "
                "Artwork. Return JSON exactly of the form: "
                '{"folders": {"<index>": "<folder name>"}} with a key for every '
                "index listed. Folder names must be at most 3 words and contain "
                "only letters, digits, spaces, dash or underscore - no slashes, "
                "dots, or path characters."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Thought title: {thought_title or '(none)'}"
                + (f"\nThought content:\n{thought_content[:400]}" if thought_content else "")
                + "\n\nFiles:\n" + "\n".join(lines)
            ),
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
    except Exception:
        return None
    raw = result.get("folders") if isinstance(result, dict) else None
    if not isinstance(raw, dict):
        return None
    out = []
    for i in range(len(files)):
        val = raw.get(str(i))
        if not isinstance(val, str):
            val = raw.get(i)
        out.append(_sanitize_folder(val))
    return out


@app.post("/api/thoughts/{thought_id}/media")
async def upload_media(thought_id: int, files: list[UploadFile] = File(...)):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    pending = []
    for f in files:
        name = os.path.basename(f.filename or "file")
        pending.append({"name": name, "mime": _mime_type(f.content_type, name)})

    folders = await _suggest_folders(
        pending, _display_title(thought), _kb_text(thought)
    )

    root = _media_root()
    created = []
    for i, f in enumerate(files):
        info = pending[i]
        stored_name = uuid.uuid4().hex + _ext_for(info["name"])
        # PDFs are always filed under PDFs/ regardless of the AI's classification,
        # so they land somewhere predictable.
        folder = "PDFs" if info["mime"] == "application/pdf" else (
            (folders[i] if folders and folders[i] else "") or _folder_fallback(info["mime"])
        )
        dest_dir = root / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / stored_name
        size = 0
        try:
            with open(dest, "wb") as out:
                while True:
                    chunk = await f.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    size += len(chunk)
            codec = _video_codec(dest) if info["mime"].startswith("video/") else ""
            media = db.add_media(
                thought_id, info["name"],
                (folder + "/" + stored_name) if folder else stored_name,
                info["mime"], size, folder, codec,
            )
        except Exception:
            _remove_file(dest)
            raise
        created.append(media)
    return {"media": created}


@app.get("/api/thoughts/{thought_id}/media")
def list_thought_media(thought_id: int):
    if db.get_thought(thought_id) is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    return db.list_media(thought_id)


@app.get("/media/{media_id}")
def serve_media(media_id: int, request: Request):
    media = db.get_media(media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")
    path = _media_file_path(media)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file missing on disk")
    size = path.stat().st_size
    media_type = media["mime_type"] or "application/octet-stream"
    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Content-Type": media_type,
    }
    # Range requests (video seeking): return a 206 byte slice.
    range_header = request.headers.get("range")
    if range_header and size > 0:
        match = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
        if match:
            start_s, end_s = match.groups()
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else size - 1
            start = min(max(start, 0), size - 1)
            end = min(max(end, start), size - 1)
            length = end - start + 1

            def iterfile():
                with open(path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining:
                        chunk = f.read(min(65536, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            return StreamingResponse(
                iterfile(),
                status_code=206,
                headers={
                    **base_headers,
                    "Content-Range": f"bytes {start}-{end}/{size}",
                    "Content-Length": str(length),
                },
            )
    return FileResponse(path, media_type=media_type, headers=base_headers)


@app.delete("/api/media/{media_id}")
def remove_media(media_id: int):
    media = db.delete_media(media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")
    removed = _remove_file(_media_file_path(media))
    if removed:
        return {"ok": True}
    return {
        "ok": True,
        "file_removed": False,
        "warning": "Removed from the knowledge base, but the file is still in use and could not be deleted from disk. It will be cleaned up automatically when the app restarts.",
    }


def _mirror_title_case(old_title: str, new_title: str, ro_title: str) -> str:
    """Mirror a case-only rename of the English title onto the Romanian title.

    When the English title changes purely in casing (e.g. "health" -> "Health"),
    apply the same casing to the existing Romanian variant so the pair stays in
    sync ("sănătate" -> "Sănătate") without re-translating. Returns the input
    unchanged when the rename isn't case-only or there's no Romanian title."""
    if not ro_title or new_title.lower() != old_title.lower():
        return ro_title
    ro = ro_title
    old_first, new_first = old_title[:1], new_title[:1]
    if old_first.islower() and new_first.isupper():
        ro = ro[:1].upper() + ro[1:]
    elif old_first.isupper() and new_first.islower():
        ro = ro[:1].lower() + ro[1:]
    if old_title != old_title.lower() and new_title == new_title.lower():
        ro = ro.lower()
    elif old_title != old_title.upper() and new_title == new_title.upper():
        ro = ro.upper()
    return ro


async def _ensure_bilingual(title: str, content: str):
    """Return (title, content, title_ro, content_ro, ok) with ENGLISH always primary.

    Detects whether the input is English or Romanian and fills in the other
    language, so `title`/`content` are always English and `title_ro`/`content_ro`
    always Romanian. On any failure it falls back to (title, content, "", "")
    with ok=False, so callers can warn that no translation was stored."""
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
            return title, content, "", "", False
        if result.get("language") == "ro":
            return (
                (result.get("title_en") or "").strip() or title,
                (result.get("content_en") or "").strip() or content,
                (result.get("title_ro") or "").strip() or title,
                (result.get("content_ro") or "").strip() or content,
                True,
            )
        return (
            title,
            content,
            (result.get("title_ro") or "").strip(),
            (result.get("content_ro") or "").strip(),
            True,
        )
    except Exception:
        return title, content, "", "", False


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
    scope: str = "current"
    mode: str = "rerank"  # "rerank" = existing LLM behavior; "vector" = pure local embeddings


class SettingsIn(BaseModel):
    model: str | None = None
    temperature: str | None = None
    thinking: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    language: str | None = None
    auto_followups: str | None = None
    backup_dir: str | None = None
    backup_interval_hours: str | None = None
    backup_keep: str | None = None
    embedding_model: str | None = None
    embedding_enabled: str | None = None


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
    attempted_translation = False
    translation_ok = True
    if (
        not body.skip_translate
        and not title_ro
        and _setting_bool(db.get_settings().get("auto_translate", "true"))
    ):
        # Always store English as primary, regardless of the current UI language.
        attempted_translation = True
        title, content, title_ro, content_ro, translation_ok = await _ensure_bilingual(title, content)
    try:
        thought = db.create_thought(
            title, content, body.parent_ids,
            title_ro=title_ro, content_ro=content_ro, source=body.source,
            question_type=body.question_type,
        )
        # A requested auto-translate that failed leaves the thought English-only;
        # flag it so the UI can tell the user the Romanian variant is missing.
        if attempted_translation and not translation_ok:
            thought["translation_failed"] = True
        if thought:
            await asyncio.to_thread(_index_thought, thought)  # blocking ONNX work off the event loop
        return thought
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
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")
    # When renaming the English title without touching the Romanian one, keep a
    # case-only rename ("health" -> "Health") mirrored onto title_ro so the pair
    # stays in sync ("sănătate" -> "Sănătate").
    title_ro = body.title_ro
    if body.title is not None and title_ro is None:
        title_ro = _mirror_title_case(
            thought.get("title") or "", body.title, thought.get("title_ro") or ""
        )
    try:
        updated = db.update_thought(
            thought_id,
            title=body.title,
            content=body.content,
            title_ro=title_ro,
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
    if updated:
        _index_thought(updated)
    return updated


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
    ids = db.delete_thought(thought_id, cascade=cascade)
    db.log_event("delete", thought_id, detail=f"cascade={cascade} ids={ids}")
    # Media files are intentionally kept on disk so a restore brings them back;
    # they are only removed on an explicit purge.
    return {"ok": True, "deleted": ids}


# ------------------------------------------------------------------ recycle bin

@app.get("/api/trash")
def list_trash():
    return {"items": db.list_deleted()}


@app.post("/api/thoughts/{thought_id}/restore")
def restore_thought(thought_id: int):
    thought = db.restore_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found in trash")
    db.log_event("restore", thought_id)
    return thought


@app.delete("/api/thoughts/{thought_id}/purge")
def purge_thought(thought_id: int):
    media_rows = db.list_media_for_thoughts([thought_id])
    if not db.purge_thought(thought_id):
        raise HTTPException(status_code=404, detail="Thought not found")
    for m in media_rows:
        _remove_file(_media_file_path(m))
    db.log_event("purge", thought_id)
    return {"ok": True}


@app.delete("/api/trash")
def purge_trash():
    ids = db.purge_trash()
    media_rows = db.list_media_for_thoughts(ids)
    for m in media_rows:
        _remove_file(_media_file_path(m))
    db.log_event("purge_trash", detail=f"ids={ids}")
    return {"ok": True, "purged": ids}


# ------------------------------------------------------------------ backups

@app.get("/api/backups")
def list_backups():
    return {"items": backup.list_backups()}


@app.post("/api/backups")
def create_backup(scope: str = "current"):
    if scope == "all":
        created = backup.backup_all()
    else:
        name = kb_registry.get_current()
        created = [backup.create_backup(name)]
    for b in created:
        db.log_event("backup", detail=f"name={b['name']} file={b['filename']}")
    return {"items": created}


class RestoreBackupIn(BaseModel):
    name: str
    filename: str


@app.post("/api/backups/restore")
def restore_backup(body: RestoreBackupIn):
    try:
        live_path = backup.restore_backup(body.name, body.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    # Re-sync the live DB's schema/FTS (a restored older backup may predate
    # columns or triggers added since).
    if body.name == kb_registry.get_current():
        db.set_db_path(live_path)
        db.init_db()
    _request_rebuild("all", resolve_settings().get("embedding_model"))
    db.log_event("restore_backup", detail=f"name={body.name} file={body.filename}")
    return {"ok": True, "path": live_path}


# ------------------------------------------------------------------ audit

@app.get("/api/audit")
def list_audit():
    return {"items": db.list_audit()}


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
def graph(scope: str = "current"):
    if scope == "all":
        # Composite "<slug>#<id>" keys so ids that collide across databases
        # stay distinguishable. Every node also carries its KB name and the
        # original numeric id so the frontend can translate back.
        nodes, edges = [], []
        for name in kb_registry.list_bases():
            g = db.get_graph_in(kb_registry.path_for(name))
            slug = Path(kb_registry.path_for(name)).stem
            for n in g["nodes"]:
                n["orig_id"] = n["id"]
                n["kb"] = name
                n["id"] = f"{slug}#{n['orig_id']}"
                nodes.append(n)
            for e in g["edges"]:
                e["id"] = f"e-{slug}#{e['id']}"
                e["parent_id"] = f"{slug}#{e['parent_id']}"
                e["child_id"] = f"{slug}#{e['child_id']}"
                edges.append(e)
        return {"nodes": nodes, "edges": edges}
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

    thoughts = _retrieve(body.title + " " + content, limit=25)
    kb_lines = [_kb_line(t) for t in thoughts]

    user_parts = [
        f"The new thought is:\nTitle: {body.title}\nContent:\n{content}",
    ]
    if body.prompt:
        user_parts.append(f"It came from this chat prompt: {body.prompt}")
    user_parts.append(
        "Choose the best existing thought to be its parent, or null for a new root "
        "thought if nothing fits or the best fit is not listed."
    )
    user_parts.append("Most relevant existing thoughts (subset):\n" + ("\n".join(kb_lines) if kb_lines else "(none)"))

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You are organizing a personal knowledge base where thoughts form a "
                "tree: each thought has a parent (or is a root). Given a new thought "
                "and a list of the most relevant existing thoughts, decide where it "
                "best belongs. Return "
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


async def _suggest_titles(title: str, content: str) -> dict:
    """Ask the model for 3-5 cleaner titles for a thought's title + content."""
    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You help title a thought in a personal knowledge base. The "
                "current title may contain conversational filler or clutter, "
                "while the real subject is shorter and clearer. Suggest 3 to 5 "
                "cleaner, more descriptive titles that capture the subject "
                "concisely. Return JSON exactly of the form: "
                '{"suggestions": [{"title": "...", "reason": "..."}]} The reason '
                "is a short one-line explanation of the change."
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


@app.post("/api/chat/suggest-title")
async def suggest_title_for_content(body: SuggestTitleIn):
    title = body.title.strip()
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="No content to title")
    return await _suggest_titles(title, content)


@app.post("/api/connections")
async def find_connections(body: ConnectionsIn):
    all_thoughts = db.list_thoughts()
    if not all_thoughts:
        raise HTTPException(status_code=400, detail="No thoughts to connect")

    theme = " ".join(t["title"] for t in all_thoughts)
    nodes = _retrieve(theme, limit=40)
    node_ids = {t["id"] for t in nodes}
    link_lines = [
        f"- {e['parent_id']} -> {e['child_id']}"
        for e in db.get_graph()["edges"]
        if e["parent_id"] in node_ids and e["child_id"] in node_ids
    ]
    existing_desc = "\n".join(link_lines) if link_lines else "(none)"
    thought_lines = [_kb_line(t) for t in nodes]

    max_n = body.max_suggestions or 8
    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You analyze a personal knowledge base to find new, meaningful "
                "relationships between the existing thoughts listed below. A "
                "thought can have a parent and children, forming a tree (a child "
                "belongs under one parent). Suggest NEW parent -> child links, "
                "between the listed thoughts only, that are not already in the "
                "graph and that make sense. Return JSON exactly of the form: "
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
                + f"\n\nSuggest up to {max_n} new parent -> child links."
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
    return await _suggest_titles(_display_title(thought), _kb_text(thought))


@app.post("/api/thoughts/{thought_id}/reanalyze")
async def reanalyze_children(thought_id: int):
    thought = db.get_thought(thought_id)
    if thought is None:
        raise HTTPException(status_code=404, detail="Thought not found")

    children = thought["children"]
    child_ids = {c["id"] for c in children}
    all_thoughts = db.list_thoughts()
    others = [
        t for t in _retrieve(_display_title(thought) + " " + _kb_text(thought), limit=20)
        if t["id"] != thought_id and t["id"] not in child_ids
    ]

    children_lines = [_kb_line(c) for c in children]
    others_lines = [_kb_line(t) for t in others]

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You analyze a parent thought and its children in a knowledge "
                "base. Determine two things. (1) Whether each current child truly "
                "belongs under this parent; if a child fits better under another "
                "existing thought, flag it as misplaced and name the better "
                "parent. (2) Which other thoughts from the provided list would "
                "fit well as new children of this parent. Return JSON exactly of "
                "the form: "
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
    related = _retrieve(_display_title(thought) + " " + _kb_text(thought), limit=50)
    existing_lines = "\n".join(f"- {t['title']}" for t in related) or "(none)"

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
        "auto_followups": settings["auto_followups"],
        "backup_dir": settings.get("backup_dir", ""),
        "backup_interval_hours": settings.get("backup_interval_hours", "24"),
        "backup_keep": settings.get("backup_keep", "14"),
        "embedding_model": settings.get("embedding_model", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"),
        "embedding_enabled": settings.get("embedding_enabled", "false"),
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
    media_rows = db.all_media()
    db.clear_base()
    for m in media_rows:
        _remove_file(_media_file_path(m))
    return _kb_list_payload()


# ------------------------------------------------------------------ stats

@app.get("/api/stats")
def stats(scope: str = "current"):
    # Follow-up question types; thoughts without a known type go to "untyped".
    QUESTION_TYPES = ("scientific", "practical", "comparative", "historical", "causal", "critical")

    def _tally(thoughts):
        by_source = {}
        by_question_type = {}
        for t in thoughts:
            src = t.get("source") or "unknown"
            by_source[src] = by_source.get(src, 0) + 1
            qtype = (t.get("question_type") or "").strip().lower()
            if qtype not in QUESTION_TYPES:
                qtype = "untyped"
            by_question_type[qtype] = by_question_type.get(qtype, 0) + 1
        return by_source, by_question_type

    if scope == "all":
        per_kb = []
        total = 0
        agg_source, agg_qtype = {}, {}
        for name in kb_registry.list_bases():
            by_source, by_qtype = _tally(db.list_thoughts_in(kb_registry.path_for(name)))
            per_kb.append({"name": name, "total": sum(by_source.values())})
            total += per_kb[-1]["total"]
            for k, v in by_source.items():
                agg_source[k] = agg_source.get(k, 0) + v
            for k, v in by_qtype.items():
                agg_qtype[k] = agg_qtype.get(k, 0) + v
        return {
            "scope": "all",
            "per_kb": per_kb,
            "total": total,
            "by_source": agg_source,
            "by_question_type": agg_qtype,
        }

    by_source, by_question_type = _tally(db.list_thoughts())
    return {"total": sum(by_source.values()), "by_source": by_source, "by_question_type": by_question_type}


# ------------------------------------------------------------------ search

@app.get("/api/search")
def search_exact(q: str = "", scope: str = "current"):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")
    # escape LIKE wildcards, keep the query literal
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    if scope == "all":
        results = []
        for name in kb_registry.list_bases():
            for r in db.search_exact_in(kb_registry.path_for(name), pattern, limit=10):
                r["kb"] = name
                results.append(r)
        return {"results": results[:40]}
    return {"results": db.search_exact_in(kb_registry.current_path(), pattern, limit=30)}


@app.post("/api/search/embeddings/rebuild")
def rebuild_embeddings(scope: str = "current"):
    if _build_state["running"]:
        return {"started": False, "scope": _build_state["scope"]}
    _request_rebuild(scope, resolve_settings().get("embedding_model"))
    return {"started": True, "scope": scope}


@app.get("/api/search/embeddings/status")
def embeddings_status(scope: str = "current"):
    settings = resolve_settings()
    out = {
        "enabled": _setting_bool(settings.get("embedding_enabled", "false")),
        "model": settings.get("embedding_model"),
        "building": _build_state["running"],
    }
    if scope == "all":
        per = []
        for name in kb_registry.list_bases():
            db.init_db(kb_registry.path_for(name))
            s = db.embedding_status_in(kb_registry.path_for(name))
            s["name"] = name
            per.append(s)
        out["per_kb"] = per
    else:
        out["kb"] = kb_registry.get_current()
        out.update(db.embedding_status_in(kb_registry.current_path()))
        out["model"] = settings.get("embedding_model")
    return out


async def _semantic_vector_search(body: SemanticSearchIn, query: str):
    """Pure local-embedding ranking — no LLM, no API key."""
    settings = resolve_settings()
    if not _setting_bool(settings.get("embedding_enabled", "false")):
        raise HTTPException(
            status_code=400,
            detail="Semantic search is not enabled. Enable it in Settings.",
        )
    model = settings.get("embedding_model")
    qvec = await asyncio.to_thread(embeddings.embed_one, query, model=model)
    if qvec is None:
        raise HTTPException(
            status_code=502,
            detail="Embedding model unavailable. Check that fastembed is installed; the model downloads on first use.",
        )

    def _row(t):
        txt = " ".join((_kb_text(t) or t.get("content") or "").split())
        return {
            "id": t["id"],
            "title": t["title"],
            "title_ro": t.get("title_ro", ""),
            "snippet": txt[:220],
            "score": round(t["score"], 4),
        }

    if body.scope == "all":
        slug_by_name = {Path(kb_registry.path_for(name)).stem: name for name in kb_registry.list_bases()}
        hits = []
        for name in kb_registry.list_bases():
            db.init_db(kb_registry.path_for(name))
            slug = Path(kb_registry.path_for(name)).stem
            for t in db.semantic_search_in(kb_registry.path_for(name), qvec, limit=8, model=model):
                r = _row(t)
                r["id"] = f"{slug}#{r['id']}"
                hits.append(r)
        hits.sort(key=lambda r: r["score"], reverse=True)
        hits = hits[:20]
        for r in hits:
            slug, _, id_part = str(r["id"]).partition("#")
            r["id"] = int(id_part)
            r["kb"] = slug_by_name.get(slug, slug)
        return {"results": hits}
    return {
        "results": [
            _row(t) for t in db.semantic_search_in(kb_registry.current_path(), qvec, limit=20, model=model)
        ]
    }


@app.post("/api/search/semantic")
async def search_semantic(body: SemanticSearchIn):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    if body.mode == "vector":
        return await _semantic_vector_search(body, query)

    if body.scope == "all":
        # Candidate thoughts from every KB, keyed by a composite "slug#id" so
        # ids that collide across databases stay distinguishable.
        slug_by_name = {Path(kb_registry.path_for(name)).stem: name for name in kb_registry.list_bases()}
        candidates = {}
        lines = []
        for name in kb_registry.list_bases():
            slug = Path(kb_registry.path_for(name)).stem
            for t in db.fts_search_in(kb_registry.path_for(name), query, limit=8):
                key = f"{slug}#{t['id']}"
                candidates[key] = t
                snippet = " ".join((_kb_text(t) or "").split())
                lines.append(f"- id {key}: {t['title']}" + (f" | {snippet[:150]}" if snippet else ""))
        id_prompt = (
            ' The id is a composite key like "health#2" that identifies the '
            "thought's knowledge base and id — use the exact composite key given."
        )
    else:
        thoughts = _retrieve(query, limit=20)
        candidates = {t["id"]: t for t in thoughts}
        lines = [_kb_line(t) for t in thoughts]
        id_prompt = ""

    messages = [
        {
            "role": "system",
            "content": _lang_instruction() + (
                "You search a personal knowledge base. Given a user query and a "
                "list of candidate thoughts, return up to 8 thoughts most "
                "relevant to the query, ranked best first. Include thoughts that "
                "match the query's meaning or synonyms even if the exact words "
                "differ. Each match has a one-line reason. If nothing is "
                "relevant, return an empty list. Return JSON exactly of the form: "
                '{"matches": [{"id": <existing id>, "reason": "..."}]}'
            ) + id_prompt,
        },
        {
            "role": "user",
            "content": f"Query: {query}\n\nCandidate thoughts:\n" + ("\n".join(lines) if lines else "(none)"),
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

    seen = set()
    results = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        tid = item.get("id")
        reason = (item.get("reason") or "").strip()
        if tid not in candidates or tid in seen:
            continue
        seen.add(tid)
        t = candidates[tid]
        row = {
            "id": tid,
            "title": t["title"],
            "title_ro": t.get("title_ro", ""),
            "reason": reason,
        }
        if body.scope == "all":
            slug, _, id_part = str(tid).partition("#")
            row["id"] = int(id_part)
            row["kb"] = slug_by_name.get(slug, slug)
        results.append(row)
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
    # Import replaces the whole KB: drop the previous media rows' files too.
    media_rows = db.all_media()
    result = db.import_kb(graph_data)
    for m in media_rows:
        _remove_file(_media_file_path(m))
    _request_rebuild("current", resolve_settings().get("embedding_model"))
    return result


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
