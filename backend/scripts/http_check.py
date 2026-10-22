import traceback

import app.db.base  # noqa: F401
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=True)
try:
    r = client.post("/api/v1/schemes/smart-search",
                    json={"query": "I am a girl student", "language": "en", "limit": 6})
    print("STATUS", r.status_code)
    print(r.text[:500])
except Exception:
    print(traceback.format_exc()[-2500:])