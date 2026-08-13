"""Registry of knowledge bases.

Each knowledge base is its own SQLite file under knowledge_bases/. The registry
(a JSON file) tracks the KB names, their filenames, and which one is current.
"""

import json
import os
import shutil
import tempfile
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(BASE_DIR, "knowledge_bases")
REGISTRY_PATH = os.path.join(BASE_DIR, "knowledge_bases.json")

DEFAULT_KB_NAME = "My Knowledge Base"
LEGACY_DB = os.path.join(BASE_DIR, "brainforest.db")


def _read():
    if not os.path.exists(REGISTRY_PATH):
        return {"current": "", "bases": {}}
    # The registry can be briefly locked while a concurrent writer replaces it
    # on Windows; retry before giving up rather than reporting an empty set.
    for _ in range(5):
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except PermissionError:
            time.sleep(0.02)
        except OSError:
            break
    return {"current": "", "bases": {}}


def _write(data):
    # Write to a unique temp file in the same directory so the atomic
    # os.replace works on the same filesystem. Concurrent writers use distinct
    # temp names, so they can't clobber each other's file; the replace itself
    # also retries because Windows can briefly hold the target open.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(REGISTRY_PATH), prefix="kb_registry_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        for _ in range(5):
            try:
                os.replace(tmp, REGISTRY_PATH)
                return
            except PermissionError:
                time.sleep(0.05)
        os.replace(tmp, REGISTRY_PATH)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _slug(name: str) -> str:
    keep = "".join(c if (c.isalnum() or c in "-_ ") else "_" for c in name).strip()
    return (keep or "knowledge-base").replace(" ", "-").lower()


def ensure_registry():
    """Create the registry + default KB on first run. Migrates the legacy DB."""
    os.makedirs(KB_DIR, exist_ok=True)
    data = _read()
    if data["bases"]:
        return

    # bases is empty — either a genuine first run or a transient read failure
    # (the registry file can be briefly locked during a concurrent replace on
    # Windows). Rebuild from the DB files actually on disk so a failed read can
    # never wipe a real multi-KB setup.
    existing = sorted(
        f[:-3] for f in os.listdir(KB_DIR)
        if f.endswith(".db") and not f.endswith("-wal") and not f.endswith("-shm")
    )
    if existing:
        bases = {name: name + ".db" for name in existing}
        current = data.get("current") if data.get("current") in bases else existing[0]
        _write({"current": current, "bases": bases})
        return

    # Genuine first run: migrate the legacy single brainforest.db into a
    # named KB.
    if os.path.exists(LEGACY_DB):
        filename = _slug(DEFAULT_KB_NAME) + ".db"
        dest = os.path.join(KB_DIR, filename)
        shutil.move(LEGACY_DB, dest)
        for suffix in ("-wal", "-shm"):
            if os.path.exists(LEGACY_DB + suffix):
                shutil.move(LEGACY_DB + suffix, dest + suffix)
    else:
        filename = _slug(DEFAULT_KB_NAME) + ".db"

    data = {"current": DEFAULT_KB_NAME, "bases": {DEFAULT_KB_NAME: filename}}
    _write(data)


def list_bases():
    return sorted(_read()["bases"].keys())


def get_current():
    data = _read()
    return data["current"] or (list_bases() or [None])[0]


def set_current(name):
    data = _read()
    if name not in data["bases"]:
        raise KeyError(f"No knowledge base named {name!r}")
    data["current"] = name
    _write(data)


def is_duplicate(name):
    return name in _read()["bases"]


def path_for(name) -> str:
    data = _read()
    if name not in data["bases"]:
        raise KeyError(f"No knowledge base named {name!r}")
    return os.path.join(KB_DIR, data["bases"][name])


def current_path() -> str:
    return path_for(get_current())


def create_base(name):
    if is_duplicate(name):
        raise ValueError("A knowledge base with that name already exists")
    data = _read()
    filename = _slug(name) + ".db"
    data["bases"][name] = filename
    data["current"] = name
    _write(data)
    return path_for(name)


def rename_base(old_name, new_name):
    data = _read()
    if old_name not in data["bases"]:
        raise KeyError(f"No knowledge base named {old_name!r}")
    if new_name in data["bases"] and new_name != old_name:
        raise ValueError("A knowledge base with that name already exists")
    old_path = path_for(old_name)
    new_path = os.path.join(KB_DIR, _slug(new_name) + ".db")
    # Rename the DB file and media folder first so the registry is only
    # updated once the file moves succeed (avoid torn state on failure).
    try:
        _rename_db_files(old_path, new_path)
        _rename_media_dir(old_path, new_path)
    except OSError as exc:
        raise ValueError(f"Could not rename files: {exc}")
    data["bases"].pop(old_name, None)
    data["bases"][new_name] = os.path.basename(new_path)
    if data.get("current") == old_name:
        data["current"] = new_name
    _write(data)


def _rename_db_files(old_path, new_path):
    """Rename the KB's SQLite file (and WAL/SHM sidecars) to match its name."""
    if os.path.abspath(old_path) == os.path.abspath(new_path):
        return
    if os.path.exists(new_path):
        raise OSError("A knowledge base file with that name already exists")
    if os.path.exists(old_path):
        os.rename(old_path, new_path)
    for suffix in ("-wal", "-shm"):
        if os.path.exists(old_path + suffix):
            os.rename(old_path + suffix, new_path + suffix)


def _rename_media_dir(old_path, new_path):
    """Move the KB's media folder to follow its renamed database file."""
    old_slug = os.path.splitext(os.path.basename(old_path))[0]
    new_slug = os.path.splitext(os.path.basename(new_path))[0]
    if old_slug == new_slug:
        return
    old_dir = os.path.join(BASE_DIR, "media", old_slug)
    new_dir = os.path.join(BASE_DIR, "media", new_slug)
    if not os.path.isdir(old_dir):
        return
    if os.path.isdir(new_dir):
        # Target exists (shouldn't normally happen): merge contents in.
        for entry in os.listdir(old_dir):
            shutil.move(os.path.join(old_dir, entry), os.path.join(new_dir, entry))
        os.rmdir(old_dir)
    else:
        os.rename(old_dir, new_dir)


def delete_base(name):
    data = _read()
    if name not in data["bases"]:
        raise KeyError(f"No knowledge base named {name!r}")
    if len(data["bases"]) == 1:
        raise ValueError("Cannot delete the only knowledge base")
    path = path_for(name)
    del data["bases"][name]
    if data.get("current") == name:
        data["current"] = sorted(data["bases"].keys())[0]
    _write(data)
    # Remove the file (best-effort after the registry no longer references it).
    if os.path.exists(path):
        os.remove(path)
    for suffix in ("-wal", "-shm"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    # Remove the KB's media files stored alongside it.
    slug = os.path.splitext(os.path.basename(path))[0]
    media_dir = os.path.join(BASE_DIR, "media", slug)
    if os.path.isdir(media_dir):
        shutil.rmtree(media_dir, ignore_errors=True)
