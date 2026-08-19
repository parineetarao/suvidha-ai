"""
app/api/v1/voice.py

POST /api/v1/voice/transcribe — multipart audio upload -> transcription.
Owned by: Member 3 — Application lifecycle & Voice.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.voice import SUPPORTED_LANGUAGES, SpeakIn, TranscribeOut
from app.services import tts_service
from app.services.voice_service import voice_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/transcribe", response_model=TranscribeOut)
async def transcribe_audio(
    file: UploadFile = File(...),
    lang: str = Form(...),
    current_user: User = Depends(get_current_user),
) -> TranscribeOut:
    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"lang must be one of {SUPPORTED_LANGUAGES}",
        )
    if not voice_service.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice model is not loaded",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file")

    try:
        result = voice_service.transcribe(audio_bytes, lang)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return TranscribeOut(**result)


@router.post("/speak")
def speak(
    body: SpeakIn,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Server-side TTS (gTTS), added because the browser's own
    speechSynthesis only speaks languages that have a voice installed on the
    listener's OS — Tamil/Telugu/Kannada/Malayalam/Bengali/Gujarati/Punjabi
    go silently unspoken on a typical Windows Chrome install. This makes
    audio playback work the same for every listener regardless of what's
    installed on their machine."""
    try:
        audio_bytes = tts_service.synthesize(body.text, body.lang)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:  # gTTS network/HTTP failures — not this server's fault
        logger.exception("TTS synthesis failed for lang=%s", body.lang)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TTS provider request failed") from exc

    return Response(content=audio_bytes, media_type="audio/mpeg")
