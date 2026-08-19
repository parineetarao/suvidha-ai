"""
app/api/v1/csc.py

GET /api/v1/csc/nearby — nearest Common Service Centres by lat/lng. Owned
by: Member 3 — Infrastructure (CSC locator). No auth required, matching the
endpoint spec in CLAUDE.md (unlike applications/documents/voice).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.csc import CSCOut
from app.services.csc_service import nearest_cscs

router = APIRouter(prefix="/csc", tags=["csc"])


@router.get("/nearby", response_model=list[CSCOut])
def get_nearby_cscs(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(25.0, gt=0),
    db: Session = Depends(get_db),
) -> list[CSCOut]:
    return nearest_cscs(db, lat=lat, lng=lng, radius_km=radius_km)
