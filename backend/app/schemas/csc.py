"""
app/schemas/csc.py

Response shape for GET /api/v1/csc/nearby. Owned by: Member 3 —
Infrastructure (CSC locator).
"""

import uuid

from pydantic import BaseModel


class CSCOut(BaseModel):
    id: uuid.UUID
    name: str
    address: str
    latitude: float
    longitude: float
    distance_km: float
