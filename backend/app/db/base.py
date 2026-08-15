"""
db/base.py

Defines Base first — before any model imports — because every model
file does `from app.db.base import Base`. If a model import appeared
before Base is defined in this file, Python would still be mid-way
through executing this file (stuck on that import) when it jumps into
the model file and gets asked for Base, which doesn't exist yet. Base
must come first, full stop.

Model imports below exist purely for their side effect: importing a
model file registers that model's table on Base.metadata, which is what
lets Alembic's autogenerate see it. The names aren't otherwise used in
this file — that's expected, not a mistake.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base — all models inherit from this."""


# --- Member 1 (Identity & Access) ---
from app.models.user import User, UserProfile        # noqa: E402, F401
from app.models.otp import OTPRequest                 # noqa: E402, F401
from app.models.admin import Admin                    # noqa: E402, F401
from app.models.audit import AuditLog                 # noqa: E402, F401
from app.models.refresh_token import RefreshToken     # noqa: E402, F401

# --- Member 2 (Scheme Discovery) ---
from app.models.scheme import Scheme                   # noqa: E402, F401

# --- Member 3 (Application / Voice) ---
from app.models.application import Application, ApplicationStatusHistory  # noqa: E402, F401
from app.models.document import DocumentVerification                       # noqa: E402, F401
from app.models.csc import CSC                                             # noqa: E402, F401
