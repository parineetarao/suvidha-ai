"""
app/services/embedding_service.py

Wraps the sentence-transformer model that converts text into 384-dimension
vectors for semantic search, across all 10 supported languages.
Owned by: Member 2 — Scheme Discovery Engine.

CRITICAL: the model takes ~5 seconds and ~500MB RAM to load. It must be
loaded ONCE, at FastAPI startup, and reused for every request afterward.
Loading it per-request would make every API call take 5+ seconds and would
eventually exhaust server RAM. This module enforces "load once" with a
module-level singleton plus a lock, so even if load() is accidentally
called from two places, the model is only ever loaded a single time.
"""

import logging
from threading import Lock

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM = 384  # must match Vector(384) in app/models/scheme.py — if you
                      # ever change the model, this constant and that column
                      # both need updating together, or search silently breaks


class EmbeddingService:
    """Thin wrapper around a SentenceTransformer model.

    Usage:
        embedding_service.load()                          # once, at app startup
        vec = embedding_service.encode("I am a farmer")    # -> list[float], len 384
    """

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME, cache_dir: str | None = None):
        self.model_name = model_name
        self.cache_dir = cache_dir
        self._model: SentenceTransformer | None = None
        self._lock = Lock()

    @property
    def is_ready(self) -> bool:
        """search_service.py checks this before attempting semantic search.
        If False (model failed to load), it falls back to TF-IDF-only
        search rather than crashing — this is the direct answer to the
        viva question 'what if the sentence-transformer model doesn't load?'"""
        return self._model is not None

    def load(self) -> None:
        """Loads the model into memory. Called once, from main.py's FastAPI
        lifespan handler (Member 3's file) on app startup. Safe to call more
        than once — later calls are a no-op once the model is already loaded."""
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:  # re-check inside the lock, in case
                return                    # two startup calls raced each other
            try:
                logger.info("Loading embedding model %s ...", self.model_name)
                self._model = SentenceTransformer(self.model_name, cache_folder=self.cache_dir)
                logger.info("Embedding model loaded.")
            except Exception:
                # Deliberately don't crash the whole app if the model fails to
                # download/load (no internet on first boot, disk full, etc).
                # search_service.py checks is_ready and degrades gracefully.
                logger.exception("Failed to load embedding model — semantic search will be disabled.")
                self._model = None

    def encode(self, text: str) -> list[float]:
        """Encodes one string into a 384-dim vector. Works for any of the
        app's 10 supported languages without being told which language the
        text is in — the model was trained multilingually, so semantically
        similar sentences land close together in vector space regardless
        of source language."""
        if not self.is_ready:
            raise RuntimeError(
                "Embedding model is not loaded. Call load() at startup, "
                "or check is_ready before calling encode()."
            )
        vector = self._model.encode(text, normalize_embeddings=True)
        return vector.tolist()

    def encode_batch(self, texts: list[str]) -> list[list[float]]:
        """Encodes many strings in one call. Used by seed_schemes.py and
        reindex_embeddings.py, which each need to embed dozens or hundreds
        of scheme descriptions at once — batching lets the model process
        them together instead of one at a time in a loop, which is
        significantly faster on CPU."""
        if not self.is_ready:
            raise RuntimeError("Embedding model is not loaded.")
        vectors = self._model.encode(texts, normalize_embeddings=True, batch_size=32)
        return vectors.tolist()


# Module-level singleton. Import this instance everywhere it's needed —
# `from app.services.embedding_service import embedding_service` — so the
# whole app shares one loaded model instead of every importer accidentally
# creating its own ~500MB copy.
embedding_service = EmbeddingService()