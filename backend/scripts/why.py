import sys

import app.db.base  # noqa: F401
from fastapi.testclient import TestClient
from app.main import app

q = " ".join(sys.argv[1:]) or "I am a retired person"
with TestClient(app) as client:
    r = client.post("/api/v1/schemes/smart-search", json={"query": q, "language": "en", "limit": 10})
    print("STATUS", r.status_code)