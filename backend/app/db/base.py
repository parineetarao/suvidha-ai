from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base — all models inherit from this."""


# Model imports go here so Alembic's autogenerate can discover them via
# Base.metadata. Each model file is Phase 2 work; add one import per model,
# never remove or reorder another member's line.
# from app.models.application import Application          # Member 3
# from app.models.document import DocumentVerification     # Member 3
# from app.models.user import User                         # Member 1
# from app.models.scheme import Scheme                     # Member 2
