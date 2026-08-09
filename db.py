"""SQLite data layer for the knowledge base.

A thought is a node; a link is a directed parent -> child edge. A thought may
have zero or many parents (a DAG, like TheBrain). Siblings are thoughts that
share at least one parent.
"""

import math
import os
import struct
import sqlite3
import contextvars
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LEGACY_DB_PATH = os.path.join(BASE_DIR, "knowledge_brain.db")

# The active knowledge base lives in a contextvar so it propagates correctly
# between FastAPI's async (event-loop) endpoints and sync (threadpool) endpoints
# (anyio copies the context into worker threads). Falls back to the legacy path
# before migration.
_db_path_var = contextvars.ContextVar("db_path", default=None)


def set_db_path(path: str):
    _db_path_var.set(os.path.abspath(path))


def _db_path() -> str:
    return _db_path_var.get() or LEGACY_DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    title_ro TEXT NOT NULL DEFAULT '',
    content_ro TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    question_type TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    child_id INTEGER NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(parent_id, child_id)
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    folder TEXT NOT NULL DEFAULT '',
    codec TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_thought ON media(thought_id);
CREATE TABLE IF NOT EXISTS thought_embeddings (
    thought_id INTEGER PRIMARY KEY REFERENCES thoughts(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    dim INTEGER NOT NULL,
    vector BLOB NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    action TEXT NOT NULL,
    thought_id INTEGER,
    detail TEXT NOT NULL DEFAULT ''
);
"""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _connect(path=None):
    conn = sqlite3.connect(path or _db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    # synchronous=FULL fsyncs the WAL on every commit so a power loss can't
    # drop the last write; negligible cost at this write volume. busy_timeout
    # makes concurrent writers (app.py + followup_questions.py) wait instead
    # of failing a write with "database is locked".
    conn.execute("PRAGMA synchronous = FULL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db(path=None):
    """Ensure the schema + migrations for the current (or an explicit) KB file."""
    conn = _connect(path)
    try:
        conn.executescript(SCHEMA)
        # migrate existing DBs: add title_ro / content_ro if missing
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(thoughts)").fetchall()]
        if "title_ro" not in cols:
            conn.execute("ALTER TABLE thoughts ADD COLUMN title_ro TEXT NOT NULL DEFAULT ''")
        if "content_ro" not in cols:
            conn.execute("ALTER TABLE thoughts ADD COLUMN content_ro TEXT NOT NULL DEFAULT ''")
        if "source" not in cols:
            conn.execute("ALTER TABLE thoughts ADD COLUMN source TEXT NOT NULL DEFAULT ''")
        if "question_type" not in cols:
            conn.execute("ALTER TABLE thoughts ADD COLUMN question_type TEXT NOT NULL DEFAULT ''")
        mcols = [r["name"] for r in conn.execute("PRAGMA table_info(media)").fetchall()]
        if "codec" not in mcols:
            conn.execute("ALTER TABLE media ADD COLUMN codec TEXT NOT NULL DEFAULT ''")
        if "deleted_at" not in cols:
            conn.execute("ALTER TABLE thoughts ADD COLUMN deleted_at TEXT")
        _init_fts(conn)
        conn.commit()
    finally:
        conn.close()


def check_integrity(path=None) -> bool:
    """Run PRAGMA quick_check. Returns True when the DB is healthy; logs on failure.

    Quick-check is relatively cheap but touches every page of the database, so it
    is run once at app startup (lifespan), not per-request."""
    import logging
    conn = _connect(path)
    try:
        rows = [r[0] for r in conn.execute("PRAGMA quick_check").fetchall()]
    finally:
        conn.close()
    ok = rows == ["ok"]
    if not ok:
        logging.error("SQLite integrity check failed for %s:\n%s", path or _db_path(), "\n".join(rows))
    return ok


# ------------------------------------------------------- full-text search

# FTS5 index over both languages so local BM25 retrieval can replace
# re-dumping the whole knowledge base to the model on every request.
_FTS_TRIGGERS = """
CREATE TRIGGER IF NOT EXISTS thoughts_fts_ai AFTER INSERT ON thoughts BEGIN
    INSERT INTO thoughts_fts(rowid, title, content, title_ro, content_ro)
    VALUES (new.id, new.title, new.content, new.title_ro, new.content_ro);
END;
CREATE TRIGGER IF NOT EXISTS thoughts_fts_ad AFTER DELETE ON thoughts BEGIN
    DELETE FROM thoughts_fts WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS thoughts_fts_au AFTER UPDATE ON thoughts BEGIN
    DELETE FROM thoughts_fts WHERE rowid = old.id;
    INSERT INTO thoughts_fts(rowid, title, content, title_ro, content_ro)
    SELECT new.id, new.title, new.content, new.title_ro, new.content_ro
    WHERE new.deleted_at IS NULL;
END;
"""


def _init_fts(conn):
    # Prefer accent-insensitive tokenizing (matters for Romanian); fall back to
    # plain unicode61 if the SQLite build doesn't support the option.
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts USING fts5("
            "title, content, title_ro, content_ro, "
            "tokenize='unicode61 remove_diacritics 2')"
        )
    except sqlite3.OperationalError:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts USING fts5("
            "title, content, title_ro, content_ro)"
        )
    # Recreate the sync triggers so a stale version left behind by earlier code
    # is replaced (cheap for a local app).
    for name in ("thoughts_fts_ai", "thoughts_fts_ad", "thoughts_fts_au"):
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")
    conn.executescript(_FTS_TRIGGERS)
    # Backfill / resync if the index drifted from the thoughts table (e.g. the
    # FTS table was created after some thoughts already existed).
    try:
        fts_count = conn.execute("SELECT count(*) FROM thoughts_fts").fetchone()[0]
        # Compare against active thoughts only; soft-deleted ones are excluded
        # from the FTS index (see thoughts_fts_au trigger).
        row_count = conn.execute(
            "SELECT count(*) FROM thoughts WHERE deleted_at IS NULL"
        ).fetchone()[0]
        if fts_count != row_count:
            conn.execute("DELETE FROM thoughts_fts")
            conn.execute(
                "INSERT INTO thoughts_fts(rowid, title, content, title_ro, content_ro) "
                "SELECT id, title, content, title_ro, content_ro FROM thoughts "
                "WHERE deleted_at IS NULL"
            )
    except sqlite3.OperationalError:
        pass


STOPWORDS = frozenset("""
a an and are as at be but by for from had has have he her his how i if in is it
its may my not of on or our she so that the their then there these they this to
was we what when where which who why will with would you your
am bine care cu de dar din este fi pentru pe sa sau se si sunt un o la mai ori
fara sub peste prin fie intr ca chiar decat dupa inca nici altceva atat iar niciun
""".split())


def _fts_query(text: str) -> str:
    """Turn free text into a safe FTS5 MATCH expression (OR of quoted literals)."""
    terms = []
    for token in text.lower().split():
        clean = "".join(ch for ch in token if ch.isalnum())
        if len(clean) >= 2 and clean not in STOPWORDS:
            terms.append('"' + clean.replace('"', '""') + '"')
    return " OR ".join(terms)


def fts_search(text: str, limit: int = 20) -> list[dict]:
    """Top thoughts ranked by BM25 relevance to `text`, best first.

    Returns full thought rows plus an `fts_rank` field. Returns [] when the
    query has no meaningful terms.
    """
    query = _fts_query(text)
    if not query:
        return []
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT t.*, bm25(thoughts_fts) AS fts_rank "
            "FROM thoughts_fts JOIN thoughts t ON t.id = thoughts_fts.rowid "
            "WHERE thoughts_fts MATCH ? AND t.deleted_at IS NULL "
            "ORDER BY fts_rank, t.id LIMIT ?",
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []
    finally:
        conn.close()


def fts_search_in(path: str, text: str, limit: int = 20) -> list[dict]:
    """fts_search against an explicit knowledge base file instead of the current one."""
    query = _fts_query(text)
    if not query:
        return []
    conn = _connect(path)
    try:
        rows = conn.execute(
            "SELECT t.*, bm25(thoughts_fts) AS fts_rank "
            "FROM thoughts_fts JOIN thoughts t ON t.id = thoughts_fts.rowid "
            "WHERE thoughts_fts MATCH ? AND t.deleted_at IS NULL "
            "ORDER BY fts_rank, t.id LIMIT ?",
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []
    finally:
        conn.close()


def search_exact_in(path: str, pattern: str, limit: int = 30) -> list[dict]:
    """LIKE search against an explicit knowledge base file instead of the current one."""
    conn = _connect(path)
    try:
        rows = conn.execute(
            "SELECT id, title, title_ro, content, content_ro FROM thoughts "
            "WHERE (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') "
            "AND deleted_at IS NULL ORDER BY title LIMIT ?",
            (pattern, pattern, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ------------------------------------------------------------ embeddings

def _pack_vec(vec) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack_vec(blob: bytes, dim: int) -> list[float]:
    return list(struct.unpack(f"<{dim}f", blob))


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


def save_embedding(thought_id, model, dim, vector, path=None):
    """Upsert one thought's embedding vector."""
    conn = _connect(path)
    try:
        conn.execute(
            "INSERT INTO thought_embeddings (thought_id, model, dim, vector, updated_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(thought_id) DO UPDATE SET model=excluded.model, dim=excluded.dim, "
            "vector=excluded.vector, updated_at=excluded.updated_at",
            (thought_id, model, dim, _pack_vec(vector), _now()),
        )
        conn.commit()
    finally:
        conn.close()


def save_embeddings_bulk(rows, model, path=None):
    """Batched upsert; rows = [(thought_id, vector), ...]."""
    if not rows:
        return
    conn = _connect(path)
    try:
        conn.executemany(
            "INSERT INTO thought_embeddings (thought_id, model, dim, vector, updated_at) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(thought_id) DO UPDATE SET model=excluded.model, "
            "dim=excluded.dim, vector=excluded.vector, updated_at=excluded.updated_at",
            [(tid, model, len(v), _pack_vec(v), _now()) for tid, v in rows],
        )
        conn.commit()
    finally:
        conn.close()


def semantic_search_in(path, query_vec, limit=20, model=None):
    """Pure-Python cosine ranking against stored embeddings.

    Returns full thought rows plus a `score` field, filtered to active thoughts
    (deleted_at IS NULL) and, when `model` is given, to vectors built with that
    model. Swallows OperationalError like fts_search."""
    conn = _connect(path)
    try:
        if model:
            rows = conn.execute(
                "SELECT t.*, e.model AS emb_model, e.dim, e.vector FROM thought_embeddings e "
                "JOIN thoughts t ON t.id = e.thought_id "
                "WHERE t.deleted_at IS NULL AND e.model = ?",
                (model,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT t.*, e.model AS emb_model, e.dim, e.vector FROM thought_embeddings e "
                "JOIN thoughts t ON t.id = e.thought_id WHERE t.deleted_at IS NULL"
            ).fetchall()
    except sqlite3.OperationalError:
        return []
    try:
        scored = []
        for r in rows:
            vec = _unpack_vec(r["vector"], r["dim"])
            row = {k: r[k] for k in r.keys() if k not in ("vector", "emb_model", "dim")}
            row["score"] = _cosine(query_vec, vec)
            scored.append(row)
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]
    finally:
        conn.close()


def embedding_status_in(path=None):
    """Return {total, embedded, model} for the current or an explicit KB."""
    conn = _connect(path)
    try:
        total = conn.execute("SELECT COUNT(*) FROM thoughts WHERE deleted_at IS NULL").fetchone()[0]
        embedded = conn.execute(
            "SELECT COUNT(*) FROM thought_embeddings e JOIN thoughts t ON t.id = e.thought_id "
            "WHERE t.deleted_at IS NULL"
        ).fetchone()[0]
        model = conn.execute("SELECT model FROM thought_embeddings LIMIT 1").fetchone()
    finally:
        conn.close()
    return {"total": total, "embedded": embedded, "model": (model[0] if model else None)}


# ---------------------------------------------------------------- thoughts

class DuplicateTitleError(Exception):
    def __init__(self, title, existing_id):
        super().__init__(f"A thought titled {title!r} already exists")
        self.title = title
        self.existing_id = existing_id


def create_thought(title: str, content: str = "", parent_ids=None, title_ro: str = "", content_ro: str = "", source: str = "", question_type: str = ""):
    ts = _now()
    parent_ids = parent_ids or []
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id FROM thoughts WHERE lower(trim(title)) = lower(trim(?)) "
            "AND deleted_at IS NULL",
            (title,),
        ).fetchone()
        if row is not None:
            raise DuplicateTitleError(title, row["id"])
        cur = conn.execute(
            "INSERT INTO thoughts (title, content, title_ro, content_ro, source, question_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (title, content, title_ro, content_ro, source, question_type, ts, ts),
        )
        thought_id = cur.lastrowid
        for pid in parent_ids:
            _insert_link(conn, pid, thought_id)
        conn.commit()
        return get_thought(thought_id)
    finally:
        conn.close()


def get_thought(thought_id: int):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM thoughts WHERE id = ? AND deleted_at IS NULL", (thought_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row) | {
            "parents": _parents(conn, thought_id),
            "children": _children(conn, thought_id),
            "siblings": _siblings(conn, thought_id),
        }
    finally:
        conn.close()


def list_thoughts():
    conn = _connect()
    try:
        # Deterministic ordering (created_at can tie) keeps identical requests
        # byte-identical so DeepSeek's prefix cache can hit on repeat calls.
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE deleted_at IS NULL ORDER BY created_at, id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_thoughts_in(path: str) -> list[dict]:
    """list_thoughts against an explicit knowledge base file instead of the current one."""
    conn = _connect(path)
    try:
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE deleted_at IS NULL ORDER BY created_at, id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_thought(thought_id: int, title=None, content=None, title_ro=None, content_ro=None, source=None):
    conn = _connect()
    try:
        if title is not None:
            row = conn.execute(
                "SELECT id FROM thoughts WHERE lower(trim(title)) = lower(trim(?)) "
                "AND id != ? AND deleted_at IS NULL",
                (title, thought_id),
            ).fetchone()
            if row is not None:
                raise DuplicateTitleError(title, row["id"])
        sets, args = [], []
        if title is not None:
            sets.append("title = ?")
            args.append(title)
        if content is not None:
            sets.append("content = ?")
            args.append(content)
        if title_ro is not None:
            sets.append("title_ro = ?")
            args.append(title_ro)
        if content_ro is not None:
            sets.append("content_ro = ?")
            args.append(content_ro)
        if source is not None:
            sets.append("source = ?")
            args.append(source)
        if not sets:
            return get_thought(thought_id)
        sets.append("updated_at = ?")
        args.append(_now())
        args.append(thought_id)
        conn.execute(f"UPDATE thoughts SET {', '.join(sets)} WHERE id = ?", args)
        conn.commit()
        return get_thought(thought_id)
    finally:
        conn.close()


def delete_thought(thought_id: int, cascade: bool = False):
    """Soft-delete a thought (and, with cascade, its descendants).

    Rows, links, comments, and media stay intact so the thought can be restored
    from the recycle bin; it is simply hidden from all active queries and search.
    Returns the list of soft-deleted ids.
    """
    conn = _connect()
    ts = _now()
    try:
        ids = [thought_id]
        if cascade:
            ids += _descendant_ids(conn, thought_id)
        conn.execute(
            "UPDATE thoughts SET deleted_at = ? WHERE id = ?",
            (ts, thought_id),
        )
        for cid in ids[1:]:
            conn.execute(
                "UPDATE thoughts SET deleted_at = ? WHERE id = ?",
                (ts, cid),
            )
        conn.commit()
        return ids
    finally:
        conn.close()


def restore_thought(thought_id: int):
    """Clear the soft-delete marker. Returns the restored thought, or None."""
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE thoughts SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
            (thought_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        return get_thought(thought_id)
    finally:
        conn.close()


def purge_thought(thought_id: int) -> bool:
    """Permanently delete a single thought (recursively cleans links)."""
    conn = _connect()
    try:
        cur = conn.execute("SELECT id FROM thoughts WHERE id = ?", (thought_id,))
        if cur.fetchone() is None:
            return False
        _delete_thought_recursive(conn, thought_id)
        conn.commit()
        return True
    finally:
        conn.close()


def purge_trash():
    """Permanently delete every soft-deleted thought. Returns the purged ids."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id FROM thoughts WHERE deleted_at IS NOT NULL"
        ).fetchall()
        ids = [r["id"] for r in rows]
        for tid in ids:
            _delete_thought_recursive(conn, tid)
        conn.commit()
        return ids
    finally:
        conn.close()


def list_deleted(limit: int = 200) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, title, content, title_ro, deleted_at FROM thoughts "
            "WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _descendant_ids(conn, thought_id):
    """All ids reachable from thought_id via parent->child edges (excludes thought_id)."""
    ids = []
    seen = {thought_id}
    stack = [thought_id]
    while stack:
        cur = stack.pop()
        for row in conn.execute(
            "SELECT child_id FROM links WHERE parent_id = ?", (cur,)
        ).fetchall():
            cid = row["child_id"]
            if cid not in seen:
                seen.add(cid)
                ids.append(cid)
                stack.append(cid)
    return ids


def _delete_thought_recursive(conn, thought_id):
    conn.execute("DELETE FROM thoughts WHERE id = ?", (thought_id,))
    conn.execute("DELETE FROM links WHERE parent_id = ? OR child_id = ?", (thought_id, thought_id))


# ------------------------------------------------------------------ links

def _parents(conn, thought_id):
    rows = conn.execute(
        "SELECT t.* FROM thoughts t JOIN links l ON l.parent_id = t.id "
        "WHERE l.child_id = ? AND t.deleted_at IS NULL ORDER BY t.title",
        (thought_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _children(conn, thought_id):
    rows = conn.execute(
        "SELECT t.* FROM thoughts t JOIN links l ON l.child_id = t.id "
        "WHERE l.parent_id = ? AND t.deleted_at IS NULL ORDER BY t.title",
        (thought_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _siblings(conn, thought_id):
    rows = conn.execute(
        """
        SELECT DISTINCT t.* FROM thoughts t
        JOIN links l1 ON l1.child_id = t.id
        JOIN links l2 ON l2.parent_id = l1.parent_id
        WHERE l2.child_id = ? AND t.id != ? AND t.deleted_at IS NULL
        ORDER BY t.title
        """,
        (thought_id, thought_id),
    ).fetchall()
    return [dict(r) for r in rows]


def _insert_link(conn, parent_id, child_id):
    # Reject links that would create an ancestor cycle: adding parent -> child
    # is invalid when the child is already an ancestor of the parent.
    if _is_descendant(conn, child_id, parent_id):
        raise LinkCycleError(parent_id, child_id)
    conn.execute(
        "INSERT OR IGNORE INTO links (parent_id, child_id, label, created_at) VALUES (?, ?, '', ?)",
        (parent_id, child_id, _now()),
    )


def create_link(parent_id: int, child_id: int):
    if parent_id == child_id:
        raise LinkCycleError(parent_id, child_id)
    conn = _connect()
    try:
        _insert_link(conn, parent_id, child_id)
        conn.commit()
        return get_graph()
    finally:
        conn.close()


def validate_link(parent_id: int, child_id: int):
    """Return (ok: bool, reason: str) for a proposed parent -> child link."""
    conn = _connect()
    try:
        parent = conn.execute(
            "SELECT id FROM thoughts WHERE id = ? AND deleted_at IS NULL", (parent_id,)
        ).fetchone()
        if parent is None:
            return False, "Thought not found"
        child = conn.execute(
            "SELECT id FROM thoughts WHERE id = ? AND deleted_at IS NULL", (child_id,)
        ).fetchone()
        if child is None:
            return False, "Thought not found"
        if parent_id == child_id:
            return False, "Cannot link a thought to itself"
        exists = conn.execute(
            "SELECT id FROM links WHERE parent_id = ? AND child_id = ?",
            (parent_id, child_id),
        ).fetchone()
        if exists is not None:
            return False, "Already linked"
        if _is_descendant(conn, child_id, parent_id):
            return False, "Would create a cycle"
        return True, ""
    finally:
        conn.close()


def delete_link(link_id: int):
    conn = _connect()
    try:
        conn.execute("DELETE FROM links WHERE id = ?", (link_id,))
        conn.commit()
    finally:
        conn.close()


def _is_descendant(conn, start_id, target_id):
    """True if target_id is a descendant of start_id (reachable via parent->child edges)."""
    seen = set()
    stack = [start_id]
    while stack:
        cur = stack.pop()
        if cur == target_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        for row in conn.execute(
            "SELECT child_id FROM links WHERE parent_id = ?", (cur,)
        ).fetchall():
            stack.append(row["child_id"])
    return False


class LinkCycleError(Exception):
    def __init__(self, parent_id, child_id):
        super().__init__(
            f"Link would create a cycle: thought {parent_id} -> thought {child_id}"
        )
        self.parent_id = parent_id
        self.child_id = child_id


# ---------------------------------------------------------------- graph

def get_graph():
    return get_graph_in(_db_path())


def get_graph_in(path: str):
    """get_graph against an explicit knowledge base file instead of the current one."""
    conn = _connect(path)
    try:
        nodes = [dict(r) for r in conn.execute(
            "SELECT id, title, content, title_ro, content_ro, source, question_type, created_at, updated_at FROM thoughts "
            "WHERE deleted_at IS NULL ORDER BY id"
        ).fetchall()]
        # Edges are only shown when both endpoints are active, so a trashed
        # thought's links don't dangle in the graph.
        edges = [dict(r) for r in conn.execute(
            "SELECT l.id, l.parent_id, l.child_id, l.label, l.created_at FROM links l "
            "JOIN thoughts p ON p.id = l.parent_id "
            "JOIN thoughts c ON c.id = l.child_id "
            "WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY l.id"
        ).fetchall()]
        return {"nodes": nodes, "edges": edges}
    finally:
        conn.close()


# --------------------------------------------------------------- comments

def add_comment(thought_id: int, text: str):
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO comments (thought_id, text, created_at) VALUES (?, ?, ?)",
            (thought_id, text, _now()),
        )
        conn.commit()
        comment_id = cur.lastrowid
    finally:
        conn.close()
    return comment_id


def list_comments(thought_id: int):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, thought_id, text, created_at FROM comments WHERE thought_id = ? ORDER BY created_at",
            (thought_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_comment(comment_id: int) -> bool:
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------- media

def add_media(thought_id: int, filename: str, stored_path: str, mime_type: str, size_bytes: int, folder: str = "", codec: str = ""):
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO media (thought_id, filename, stored_path, mime_type, size_bytes, folder, codec, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (thought_id, filename, stored_path, mime_type, size_bytes, folder, codec, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return get_media(cur.lastrowid)


def get_media(media_id: int):
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_media(thought_id: int):
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM media WHERE thought_id = ? ORDER BY created_at, id",
            (thought_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_media_for_thoughts(ids: list[int]):
    if not ids:
        return []
    conn = _connect()
    try:
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT * FROM media WHERE thought_id IN ({placeholders})", ids
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def all_media():
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM media ORDER BY id").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_media(media_id: int):
    """Delete the media row; return the row (so the caller can remove the file) or None."""
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        if row is None:
            return None
        conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
        conn.commit()
        return dict(row)
    finally:
        conn.close()


def descendant_ids(thought_id: int):
    conn = _connect()
    try:
        return _descendant_ids(conn, thought_id)
    finally:
        conn.close()


def clear_base():
    """Delete all thoughts (cascades to links + comments). Keeps settings."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM thoughts")
        conn.commit()
    finally:
        conn.close()


def thought_count() -> int:
    conn = _connect()
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM thoughts WHERE deleted_at IS NULL"
        ).fetchone()[0]
    finally:
        conn.close()


# --------------------------------------------------------------- settings

SETTING_DEFAULTS = {
    "model": "deepseek-v4-flash",
    "temperature": "1.0",
    "thinking": "false",
    "base_url": "https://api.deepseek.com",
    "api_key": "",
    "auto_translate": "true",
    "language": "en",
    "auto_followups": "true",
    "backup_dir": "",
    "backup_interval_hours": "24",
    "backup_keep": "14",
    "embedding_model": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "embedding_enabled": "false",
}


def get_settings():
    conn = _connect()
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        stored = {r["key"]: r["value"] for r in rows}
    finally:
        conn.close()
    return {**SETTING_DEFAULTS, **stored}


def save_settings(values: dict):
    conn = _connect()
    try:
        for key, value in values.items():
            if key in SETTING_DEFAULTS:
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
        conn.commit()
    finally:
        conn.close()
    return get_settings()


# ---------------------------------------------------------------- export

def export_kb():
    return get_graph()


def import_kb(graph):
    """Replace the whole KB with the given {nodes, edges} structure."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM thoughts")
        conn.execute("DELETE FROM links")
        id_map = {}
        for n in graph.get("nodes", []):
            ts = _now()
            cur = conn.execute(
                "INSERT INTO thoughts (title, content, title_ro, content_ro, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (n.get("title", ""), n.get("content", ""), n.get("title_ro", ""), n.get("content_ro", ""), n.get("source", ""), ts, ts),
            )
            id_map[n["id"]] = cur.lastrowid
        for e in graph.get("edges", []):
            p, c = id_map.get(e.get("parent_id")), id_map.get(e.get("child_id"))
            if p is not None and c is not None:
                conn.execute(
                    "INSERT OR IGNORE INTO links (parent_id, child_id, label, created_at) VALUES (?, ?, ?, ?)",
                    (p, c, e.get("label", ""), _now()),
                )
        conn.commit()
        return get_graph()
    finally:
        conn.close()


# ------------------------------------------------------------------ audit log

def log_event(action: str, thought_id=None, detail: str = ""):
    """Record a destructive/restore operation. Best-effort: never raises."""
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO audit_log (ts, action, thought_id, detail) VALUES (?, ?, ?, ?)",
            (_now(), action, thought_id, detail),
        )
        conn.commit()
    except sqlite3.Error:
        pass
    finally:
        conn.close()


def list_audit(limit: int = 200) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, ts, action, thought_id, detail FROM audit_log "
            "ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ------------------------------------------------------------ sqlite snapshots

def backup_to(source_path: str, dest_path: str):
    """Consistent online snapshot of `source_path` into a new file `dest_path`.

    Uses VACUUM INTO, which writes a fully standalone copy of the current state
    (WAL content included) and yields a file with no -wal/-shm dependencies.
    The destination must be a SQL string literal — VACUUM INTO does not accept
    bound parameters — so single quotes are escaped.
    """
    conn = _connect(source_path)
    try:
        safe = dest_path.replace("'", "''")
        conn.execute(f"VACUUM INTO '{safe}'")
    finally:
        conn.close()


def restore_from(backup_path: str, target_path: str):
    """Overwrite `target_path` with the contents of `backup_path`.

    Uses the sqlite backup API, which writes into the live database safely
    (checkpointing any WAL first). Verifies the restored file with quick_check.
    """
    src = sqlite3.connect(backup_path)
    dst = _connect(target_path)
    try:
        src.backup(dst)
        dst.commit()
    finally:
        dst.close()
        src.close()
    ok = check_integrity(target_path)
    if not ok:
        raise sqlite3.DatabaseError(f"Restored database failed integrity check: {target_path}")
