"""
app/schemas/voice.py

Response shape for POST /api/v1/voice/transcribe. Owned by: Member 3 —
Application lifecycle & Voice.
"""

from typing import Literal

from pydantic import BaseModel

SUPPORTED_LANGUAGES = ("en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa")
VoiceLanguage = Literal["en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"]


class TranscribeOut(BaseModel):
    """Response of POST /voice/transcribe. `confidence` is derived from
    faster-whisper's per-segment avg_logprob (converted to a 0-1-ish score),
    not a calibrated probability — good enough to flag "this transcription is
    probably garbage" in the UI, not for anything more precise than that."""

    text: str
    language: str
    duration: float
    confidence: float
