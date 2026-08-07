"""SQLite data layer for the knowledge base.

A thought is a node; a link is a directed parent -> child edge. A thought may
have zero or many parents (a DAG, like TheBrain). Siblings are thoughts that
share at least one parent.
"""

import os
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
    updated_at TEXT NOT NULL
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
"""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _connect():
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    conn = _connect()
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
        conn.commit()
    finally:
        conn.close()


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
            "SELECT id FROM thoughts WHERE lower(trim(title)) = lower(trim(?))",
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
        row = conn.execute("SELECT * FROM thoughts WHERE id = ?", (thought_id,)).fetchone()
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
        rows = conn.execute("SELECT * FROM thoughts ORDER BY created_at").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_thought(thought_id: int, title=None, content=None, title_ro=None, content_ro=None, source=None):
    conn = _connect()
    try:
        if title is not None:
            row = conn.execute(
                "SELECT id FROM thoughts WHERE lower(trim(title)) = lower(trim(?)) AND id != ?",
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
    conn = _connect()
    try:
        if cascade:
            for child_id in _descendant_ids(conn, thought_id):
                _delete_thought_recursive(conn, child_id)
        _delete_thought_recursive(conn, thought_id)
        conn.commit()
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
        "SELECT t.* FROM thoughts t JOIN links l ON l.parent_id = t.id WHERE l.child_id = ? ORDER BY t.title",
        (thought_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _children(conn, thought_id):
    rows = conn.execute(
        "SELECT t.* FROM thoughts t JOIN links l ON l.child_id = t.id WHERE l.parent_id = ? ORDER BY t.title",
        (thought_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _siblings(conn, thought_id):
    rows = conn.execute(
        """
        SELECT DISTINCT t.* FROM thoughts t
        JOIN links l1 ON l1.child_id = t.id
        JOIN links l2 ON l2.parent_id = l1.parent_id
        WHERE l2.child_id = ? AND t.id != ?
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
        parent = conn.execute("SELECT id FROM thoughts WHERE id = ?", (parent_id,)).fetchone()
        if parent is None:
            return False, "Thought not found"
        child = conn.execute("SELECT id FROM thoughts WHERE id = ?", (child_id,)).fetchone()
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
    conn = _connect()
    try:
        nodes = [dict(r) for r in conn.execute(
            "SELECT id, title, content, title_ro, content_ro, source, question_type, created_at, updated_at FROM thoughts ORDER BY id"
        ).fetchall()]
        edges = [dict(r) for r in conn.execute(
            "SELECT id, parent_id, child_id, label, created_at FROM links ORDER BY id"
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
        return conn.execute("SELECT COUNT(*) FROM thoughts").fetchone()[0]
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
