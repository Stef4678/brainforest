"""Registry of knowledge bases.

Each knowledge base is its own SQLite file under knowledge_bases/. The registry
(a JSON file) tracks the KB names, their filenames, and which one is current.
"""

import json
import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(BASE_DIR, "knowledge_bases")
REGISTRY_PATH = os.path.join(BASE_DIR, "knowledge_bases.json")

DEFAULT_KB_NAME = "My Knowledge Base"
LEGACY_DB = os.path.join(BASE_DIR, "knowledge_brain.db")


def _read():
    if not os.path.exists(REGISTRY_PATH):
        return {"current": "", "bases": {}}
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"current": "", "bases": {}}


def _write(data):
    tmp = REGISTRY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, REGISTRY_PATH)


def _slug(name: str) -> str:
    keep = "".join(c if (c.isalnum() or c in "-_ ") else "_" for c in name).strip()
    return (keep or "knowledge-base").replace(" ", "-").lower()


def ensure_registry():
    """Create the registry + default KB on first run. Migrates the legacy DB."""
    os.makedirs(KB_DIR, exist_ok=True)
    data = _read()
    if data["bases"]:
        return

    # Migrate the legacy single knowledge_brain.db into a named KB.
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
    data["bases"][new_name] = data["bases"].pop(old_name)
    if data.get("current") == old_name:
        data["current"] = new_name
    _write(data)


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
