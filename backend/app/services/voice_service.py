"""
app/services/voice_service.py

Wraps faster-whisper for multilingual speech-to-text. Owned by: Member 3 —
Application lifecycle & Voice.

CRITICAL: the model must be loaded ONCE, at FastAPI startup (same pattern as
Member 2's embedding_service.py), and reused for every request. Loading it
per-request would make every call slow (model load is multi-second) and
would eventually exhaust server RAM.

Ephemeral processing: uploaded audio is written to a NamedTemporaryFile only
because faster-whisper needs a filesystem path, never persisted to the DB or
kept around after transcription — the temp file is deleted in a `finally`
block no matter how transcription goes. This mirrors the ephemeral-handling
rule in api/v1/documents.py (raw Aadhaar images never touch the server); here
it's raw audio instead of a raw document image.
"""

import logging
import math
import os
import tempfile
from threading import Lock

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

DEFAULT_MODEL_SIZE = "small"  # CPU-only deployment target; medium/large too slow without GPU

SUPPORTED_LANGUAGES = {"en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"}


class VoiceService:
    """Thin wrapper around a faster-whisper WhisperModel.

    Usage:
        voice_service.load()                                   # once, at app startup
        result = voice_service.transcribe(audio_bytes, "hi")    # -> dict
    """

    def __init__(self, model_size: str = DEFAULT_MODEL_SIZE):
        self.model_size = model_size
        self._model: WhisperModel | None = None
        self._lock = Lock()

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """Loads the model into memory. Called once, from main.py's FastAPI
        lifespan handler, on app startup. Safe to call more than once — later
        calls are a no-op once the model is already loaded."""
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:  # re-check inside the lock
                return
            try:
                logger.info("Loading faster-whisper model (%s) ...", self.model_size)
                # int8 compute type keeps CPU inference fast with a small
                # accuracy tradeoff — appropriate for our no-GPU deploy target.
                self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
                logger.info("faster-whisper model loaded.")
            except Exception:
                # Don't crash the whole app if the model fails to download/load
                # (no internet on first boot, disk full, etc) — same graceful
                # degradation pattern as embedding_service.py. Routes check
                # is_ready and return 503 rather than crashing.
                logger.exception("Failed to load faster-whisper model — voice transcription will be disabled.")
                self._model = None

    def transcribe(self, audio_bytes: bytes, language: str) -> dict:
        """Transcribes raw audio bytes (webm/mp3/wav) into text. `language`
        must be one of the 10 supported codes — passed explicitly to Whisper
        rather than relying on auto-detection, which is unreliable on the
        short (5-10s) clips this app expects.

        The audio is written to a temp file only because faster-whisper's API
        requires a filesystem path; it is deleted in `finally` regardless of
        success or failure, and is never written anywhere else."""
        if not self.is_ready:
            raise RuntimeError("Voice model is not loaded. Call load() at startup, or check is_ready first.")
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language '{language}'. Must be one of {sorted(SUPPORTED_LANGUAGES)}.")

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            segments, info = self._model.transcribe(tmp_path, language=language)
            segments = list(segments)  # faster-whisper returns a lazy generator

            text = " ".join(segment.text.strip() for segment in segments).strip()

            # avg_logprob is a log-probability (negative, closer to 0 = more
            # confident). exp() maps it into a rough 0-1 range for the UI —
            # not a calibrated probability, just a "how sure was the model" signal.
            if segments:
                avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
                confidence = round(math.exp(avg_logprob), 4)
            else:
                confidence = 0.0

            return {
                "text": text,
                "language": language,
                "duration": round(info.duration, 2),
                "confidence": confidence,
            }
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)


# Module-level singleton — import this instance everywhere it's needed so the
# whole app shares one loaded model instead of every importer accidentally
# creating its own copy.
voice_service = VoiceService()
