"""
app/api/v1/voice.py

POST /api/v1/voice/transcribe — multipart audio upload -> transcription.
Owned by: Member 3 — Application lifecycle & Voice.
"""

import logging
import time

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

    # Route-level timing, separate from voice_service's own internal
    # write/decode breakdown: `read_elapsed` is (an upper bound on) how long
    # it took to receive the uploaded audio once this route started running
    # — the closest server-side proxy for "upload time" available without
    # instrumenting Starlette's body parsing directly. `transcribe_elapsed`
    # should match voice_service's own logged write+decode time; logging
    # both here confirms nothing extra (retries, re-loading, etc) is
    # happening between the two.
    request_start = time.perf_counter()
    audio_bytes = await file.read()
    read_elapsed = time.perf_counter() - request_start
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file")

    try:
        transcribe_start = time.perf_counter()
        result = voice_service.transcribe(audio_bytes, lang)
        transcribe_elapsed = time.perf_counter() - transcribe_start
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    logger.info(
        "voice/transcribe request timing: bytes=%d body_read=%.3fs transcribe_call=%.3fs total=%.3fs",
        len(audio_bytes), read_elapsed, transcribe_elapsed, time.perf_counter() - request_start,
    )

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
