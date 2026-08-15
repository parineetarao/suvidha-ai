"""
app/services/csc_service.py

Nearest-N CSC lookup by straight-line (haversine) distance. Owned by:
Member 3 — Infrastructure (CSC locator).

Haversine, not PostGIS: our CSC count is tiny (a handful of seed rows for
the demo), so doing the distance calc in Python over all active rows is
simpler than adding a PostGIS extension for this scale, and avoids another
extension dependency alongside pgvector.
"""

import math

from sqlalchemy.orm import Session

from app.models.csc import CSC

EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1_r, lng1_r, lat2_r, lng2_r = map(math.radians, (lat1, lng1, lat2, lng2))
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def nearest_cscs(db: Session, lat: float, lng: float, radius_km: float = 25.0, limit: int = 10) -> list[dict]:
    """Returns active CSCs within radius_km of (lat, lng), nearest first.
    Distance is computed in Python after fetching all active rows — fine at
    our seed-data scale, would need a spatial index if the table grew large."""
    cscs = db.query(CSC).filter(CSC.is_active.is_(True)).all()

    results = []
    for csc in cscs:
        distance_km = _haversine_km(lat, lng, float(csc.latitude), float(csc.longitude))
        if distance_km <= radius_km:
            results.append({
                "id": csc.id,
                "name": csc.name,
                "address": csc.address,
                "latitude": float(csc.latitude),
                "longitude": float(csc.longitude),
                "distance_km": round(distance_km, 2),
            })

    results.sort(key=lambda r: r["distance_km"])
    return results[:limit]
