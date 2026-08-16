"""
app/api/v1/voice.py

POST /api/v1/voice/transcribe — multipart audio upload -> transcription.
Owned by: Member 3 — Application lifecycle & Voice.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.voice import SUPPORTED_LANGUAGES, TranscribeOut
from app.services.voice_service import voice_service

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
