"""Local embedding engine wrapping fastembed (ONNX runtime, offline after first model download).

All functions import fastembed lazily so the app boots even if the package or a
model is missing. Every function is safe to call from any thread; failures are
swallowed and reported as None rather than raised.
"""

import logging

DEFAULT_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

_model = None
_model_name = None


def _get_model(name=None):
    global _model, _model_name
    name = name or DEFAULT_MODEL
    if _model is not None and _model_name == name:
        return _model
    from fastembed import TextEmbedding  # lazy: missing dep must not crash boot

    _model = TextEmbedding(model_name=name)
    _model_name = name
    return _model


def available() -> bool:
    """Probe whether fastembed is importable. Never raises."""
    try:
        from fastembed import TextEmbedding

        return True
    except Exception:
        return False


def embed_texts(texts, model=None):
    """list[str] -> list[list[float]] or None on any failure."""
    if not texts:
        return []
    try:
        m = _get_model(model)
        vecs = list(m.embed(texts))  # generator -> list of np.ndarray float32
        return [list(v) for v in vecs]
    except Exception as exc:
        logging.warning("Embedding failed: %s", exc)
        return None


def embed_one(text, model=None):
    out = embed_texts([text], model=model)
    return out[0] if out else None
