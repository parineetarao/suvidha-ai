"""
services/user_service.py

Business logic for /users/* — identity updates and profile CRUD. Thin on
purpose: this is mostly translating between Pydantic schemas and
SQLAlchemy models, which is exactly what a service layer should look like
when the underlying operation genuinely IS simple. Not every service
function needs to be as involved as auth_service.py's — that one is
complex because OTP flows inherently are; this one is simple because
"save this profile" inherently is.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.user import User, UserProfile
from app.schemas.user import UserProfileIn, UserUpdate


def update_user(db: Session, user: User, payload: UserUpdate) -> User:
    """PATCH semantics: only fields the client actually sent get applied."""
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def get_profile(db: Session, user_id: uuid.UUID) -> UserProfile | None:
    """
    Returns None if the user hasn't submitted a profile yet — that's a
    normal, expected state (e.g. right after first login, before
    onboarding), not an error condition at this layer. The API layer
    decides whether "no profile yet" should be a 404 or something else.
    """
    return db.get(UserProfile, user_id)


def upsert_profile(db: Session, user_id: uuid.UUID, payload: UserProfileIn) -> UserProfile:
    """
    PUT semantics: creates the profile row on first submission, fully
    overwrites it on every submission after that — matching the frontend's
    behavior of always sending the complete ProfileData form, not a diff.

    This is "upsert" (update-or-insert) rather than requiring the caller
    to know in advance whether a profile already exists, because from the
    client's point of view there's no meaningful difference between
    "first-time profile submission" and "editing an existing profile" —
    it's the same form, submitted the same way, every time.
    """
    profile = db.get(UserProfile, user_id)
    data = payload.model_dump()

    if profile is None:
        profile = UserProfile(user_id=user_id, **data)
        db.add(profile)
    else:
        for field, value in data.items():
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile