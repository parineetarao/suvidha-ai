"""
app/models/document.py

DocumentVerification: the *result* of a client-side document check, never
the document itself. Owned by: Member 3 — Ephemeral processing.
"""

from app.db.base import Base
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

class DocumentVerification(Base):
    __tablename__ = "document_verifications"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Keyed to the user, not a specific application. Aadhaar/PAN/etc. don't
    # change per scheme, so one verification is reused across every
    # application that citizen files — no re-upload, no re-check, and no
    # need for an applications.id column here at all.
    document_type: Mapped[str] = mapped_column(String(30), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False)
    masked_identifier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # NO image column. NO raw number column. By design — see CLAUDE.md.
    # Aadhaar/OCR runs client-side (Tesseract.js); this row only ever
    # receives {doc_type, checks, masked_id} from the browser.