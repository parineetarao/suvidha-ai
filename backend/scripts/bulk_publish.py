"""scripts/bulk_publish.py — publishes all scraped schemes without manual review.
Safe now because LLM reranker reads eligibility_text directly."""
import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.scheme import Scheme

db = SessionLocal()
result = db.query(Scheme).filter(Scheme.is_published == False).update({"is_published": True})
db.commit()
print(f"Published {result} previously unpublished schemes.")
db.close()