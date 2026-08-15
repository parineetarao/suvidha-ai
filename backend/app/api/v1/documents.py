from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.document import DocumentVerification
from app.models.user import User
from app.schemas.application import DocumentVerifyIn, VerificationResult

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/verify", response_model=VerificationResult)
def verify_document(
    payload: DocumentVerifyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VerificationResult:
    """
    Receives only boolean checks + a masked identifier from the browser —
    never a raw document image or full ID number. OCR happens client-side
    via Tesseract.js; this endpoint just records the verification outcome.
    """
    status = "verified" if all(payload.checks.values()) else "failed"

    record = DocumentVerification(
        user_id=current_user.id,
        document_type=payload.doc_type,
        verification_status=status,
        masked_identifier=payload.masked_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return VerificationResult(
        id=record.id,
        document_type=record.document_type,
        verification_status=record.verification_status,
        masked_identifier=record.masked_identifier,
        checked_at=record.checked_at,
    )