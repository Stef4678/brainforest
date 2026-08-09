"""Online backups of knowledge-base SQLite files.

Snapshots are taken with VACUUM INTO (consistent even in WAL mode) into a
per-KB folder under a configurable root, rotated to keep the newest N. Restore
overwrites the live DB via the sqlite backup API and always makes a
pre-restore safety snapshot first so a bad restore is reversible.
"""

import os
from datetime import datetime, timezone

import db
import kb_registry

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BACKUP_DIR = os.path.join(BASE_DIR, "backups")

# Files like "pre-restore-...db" are safety nets created during a restore; they
# are kept on disk but not shown in the user-facing backup list.
_PRE_RESTORE_PREFIX = "pre-restore-"


def _backup_root():
    """Resolve the backup directory: setting, then env, then default."""
    try:
        stored = db.get_settings().get("backup_dir", "") or ""
    except Exception:
        stored = ""
    return (os.environ.get("BACKUP_DIR") or stored or DEFAULT_BACKUP_DIR).strip()


def _keep_count():
    try:
        stored = db.get_settings().get("backup_keep", "14") or "14"
    except Exception:
        stored = "14"
    try:
        return int(os.environ.get("BACKUP_KEEP") or stored)
    except ValueError:
        return 14


def _slug(name):
    return kb_registry._slug(name)


def _kb_dir(name):
    return os.path.join(_backup_root(), _slug(name))


def _stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _is_user_backup(fn):
    return fn.endswith(".db") and not fn.startswith(_PRE_RESTORE_PREFIX)


def _list_files(name):
    """Sorted user backup filenames for a KB, newest first."""
    d = _kb_dir(name)
    if not os.path.isdir(d):
        return []
    files = [f for f in os.listdir(d) if _is_user_backup(f)]
    files.sort(key=lambda f: os.path.getmtime(os.path.join(d, f)), reverse=True)
    return files


def create_backup(name) -> dict:
    """Snapshot one KB. Returns metadata for the new backup (or raises)."""
    d = _kb_dir(name)
    os.makedirs(d, exist_ok=True)
    filename = f"{_slug(name)}-{_stamp()}.db"
    dest = os.path.join(d, filename)
    db.backup_to(kb_registry.path_for(name), dest)
    # Verify the snapshot is a healthy, standalone database right away so a
    # silent corruption surfaces now (db.check_integrity logs on failure)
    # rather than only when the user tries to restore it later.
    verified = db.check_integrity(dest)
    prune(name)
    return {
        "name": name,
        "filename": filename,
        "path": dest,
        "size_bytes": os.path.getsize(dest),
        "created_at": datetime.fromtimestamp(os.path.getmtime(dest), timezone.utc).isoformat(),
        "verified": verified,
    }


def backup_all() -> list[dict]:
    """Snapshot every registered KB; returns the list of newly created backups."""
    return [create_backup(n) for n in kb_registry.list_bases()]


def backup_if_stale(hours) -> list[dict]:
    """Create a backup for each KB whose newest snapshot is older than `hours`."""
    created = []
    for name in kb_registry.list_bases():
        files = _list_files(name)
        stale = True
        if files:
            newest = os.path.join(_kb_dir(name), files[0])
            age_s = datetime.now(timezone.utc).timestamp() - os.path.getmtime(newest)
            stale = age_s >= hours * 3600
        if stale:
            created.append(create_backup(name))
    return created


def list_backups() -> list[dict]:
    """All user backups across KBs, newest first."""
    out = []
    for name in kb_registry.list_bases():
        d = _kb_dir(name)
        for fn in _list_files(name):
            path = os.path.join(d, fn)
            out.append({
                "name": name,
                "filename": fn,
                "size_bytes": os.path.getsize(path),
                "created_at": datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).isoformat(),
            })
    out.sort(key=lambda b: b["created_at"], reverse=True)
    return out


def prune(name):
    """Delete user backups beyond the keep count, plus pre-restore files past 3."""
    d = _kb_dir(name)
    if not os.path.isdir(d):
        return
    keep = max(1, _keep_count())
    for fn in _list_files(name)[keep:]:
        try:
            os.remove(os.path.join(d, fn))
        except OSError:
            pass
    # Pre-restore safety snapshots are pruned separately to bound their growth.
    pre = sorted(
        (f for f in os.listdir(d) if f.startswith(_PRE_RESTORE_PREFIX) and f.endswith(".db")),
        key=lambda f: os.path.getmtime(os.path.join(d, f)),
        reverse=True,
    )
    for fn in pre[3:]:
        try:
            os.remove(os.path.join(d, fn))
        except OSError:
            pass


def restore_backup(name: str, filename: str) -> str:
    """Overwrite the live DB of `name` from a backup. Returns the live path."""
    # Guard against path traversal: only a bare filename from this KB's dir.
    if os.path.basename(filename) != filename or filename != os.path.normpath(filename):
        raise ValueError("Invalid backup filename")
    d = _kb_dir(name)
    backup_path = os.path.join(d, filename)
    if not os.path.isfile(backup_path):
        raise FileNotFoundError(f"Backup not found: {filename}")
    live_path = kb_registry.path_for(name)

    # Safety snapshot of the current live DB so the restore is reversible.
    os.makedirs(d, exist_ok=True)
    safety = os.path.join(d, f"{_PRE_RESTORE_PREFIX}{_slug(name)}-{_stamp()}.db")
    db.backup_to(live_path, safety)

    db.restore_from(backup_path, live_path)
    return live_path
