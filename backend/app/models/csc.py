"""
app/models/csc.py

CSC (Common Service Centre): a physical location where citizens without
internet/device access can get help applying for schemes in person. Owned
by: Member 3 — Infrastructure (CSC locator).
"""

import uuid

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CSC(Base):
    __tablename__ = "cscs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)

    # Numeric (not Float) for lat/lng — avoids floating point drift on a
    # value that's only ever compared/displayed, never arithmetic-heavy
    # beyond the haversine calc done in Python at query time.
    latitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
