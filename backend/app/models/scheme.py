"""
app/models/scheme.py

SQLAlchemy model for a government welfare scheme.
Owned by: Member 2 — Scheme Discovery Engine.

REVISION NOTE: originally used one column per language (name_hi, name_mr, ...).
Redesigned to a single JSONB `translations` column to support 10 languages
without a schema migration every time a language is added. See
SUPPORTED_LANGUAGES below for the canonical list.

REVISION NOTE 2: added `warning` and `rejection_risks` — the frontend had
this content per scheme (in 3 languages) with nowhere for it to live in the
original model. matching_service.py needs real per-scheme risk data, not
just a generic "hard to get documents" heuristic.
"""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, Boolean, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base  # Member 3 owns this file

# The 10 languages this project supports. Defined once, here, and imported
# everywhere else (schemas, search_service, seed_schemes, frontend language
# selector spec) so there is exactly one source of truth for "which languages
# exist" — never re-typed as a literal list a second time.
SUPPORTED_LANGUAGES: tuple[str, ...] = (
    "en",  # English
    "hi",  # Hindi
    "mr",  # Marathi
    "ta",  # Tamil
    "te",  # Telugu
    "kn",  # Kannada
    "ml",  # Malayalam
    "bn",  # Bengali
    "gu",  # Gujarati
    "pa",  # Punjabi
)


class Scheme(Base):
    """A single government welfare scheme (e.g. PM Kisan, Ayushman Bharat)."""

    __tablename__ = "schemes"

    # --- Identity -----------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scheme_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # --- Canonical (English) fields ------------------------------------
    # Always present, always English. This is the fallback shown if a
    # translation is missing for the citizen's chosen language, and it's
    # what admins see/edit by default in the CMS. Everything else, including
    # the English strings again for consistency, lives in `translations`.
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    benefits: Mapped[str | None] = mapped_column(Text)

    ministry: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(80), index=True)

    # --- Translations ----------------------------------------------------
    # Shape: {"hi": {"name": "...", "description": "...", "benefits": "..."},
    #         "ta": {"name": "...", "description": "...", "benefits": "..."},
    #         ...}
    # Keys are a subset of SUPPORTED_LANGUAGES — a scheme doesn't need every
    # language translated on day one; missing keys fall back to the English
    # columns above. This is the piece that lets you add an 11th language
    # later purely as a data-entry task, with zero schema migration.
    translations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # --- Eligibility & application logistics ------------------------
    # Shape (not enforced by the DB, enforced by Pydantic on write):
    # {min_age, max_age, states: [...], income_max, categories: [...],
    #  occupations: [...], gender?, disability?}
    eligibility_rules: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    documents_required: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    application_modes: Mapped[list[str]] = mapped_column(
        ARRAY(String(30)), default=list
    )  # online / offline / csc

    # A single standout caution for this scheme (e.g. "Aadhaar must be linked
    # to bank account before applying"). English here; translated versions
    # live under translations[lang]["warning"]. Added specifically to close
    # the gap flagged while porting seed data: the frontend already had this
    # per scheme in 3 languages and the model had nowhere to put it.
    warning: Mapped[str | None] = mapped_column(Text)

    # Shape: [{"risk": "...", "fix": "..."}, ...]. English only for now —
    # translating rejection_risks per language is future work, not blocking.
    rejection_risks: Mapped[list[dict]] = mapped_column(JSONB, default=list)

    # --- Added after inspecting real myScheme page structure ---------------
    # The real site's "Eligibility" section is free-form paragraph text, not
    # structured data — we can't reliably auto-parse it into eligibility_rules
    # (income caps, occupation lists, etc). This stores the real text verbatim
    # for citizens to read; eligibility_rules stays a separate, structured,
    # best-effort/manually-curated field used for actual filtering logic.
    eligibility_text: Mapped[str | None] = mapped_column(Text)
    application_process: Mapped[str | None] = mapped_column(Text)
    # Shape: [{"question": "...", "answer": "..."}, ...]
    faqs: Mapped[list[dict]] = mapped_column(JSONB, default=list)

    application_url: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # --- Search --------------------------------------------------------
    # 384 = output dimension of paraphrase-multilingual-MiniLM-L12-v2, which
    # supports 50+ languages out of the box — including all 10 above — so
    # this column needs no changes for the language expansion.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384), nullable=True)

    # --- Bookkeeping -----------------------------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        # ivfflat index — real CREATE INDEX happens in an Alembic migration
        # after seed_schemes.py populates rows, not here. Kept as documented
        # intent.
        Index(
            "scheme_embedding_idx",
            "embedding",
            postgresql_using="ivfflat",
            postgresql_with={"lists": 100},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def localized(self, field: str, lang: str) -> str | None:
        """Look up a translated field with English fallback.
        e.g. scheme.localized("name", "ta") -> Tamil name, or English name
        if no Tamil translation exists yet for this scheme."""
        if lang != "en" and lang in self.translations:
            value = self.translations[lang].get(field)
            if value:
                return value
        return getattr(self, field, None)

    def __repr__(self) -> str:
        return f"<Scheme {self.scheme_code} ({self.name})>"