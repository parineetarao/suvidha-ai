"""
api/v1/users.py

The /users/* endpoints. Every route here requires get_current_user —
there is no such thing as an anonymous request to any of these; you can
only ever read or write YOUR OWN user/profile, never someone else's
(there's no {user_id} in any of these paths, deliberately — identity
comes entirely from the JWT, never from a URL parameter a client could
tamper with).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import ContactOTPIn, ContactVerifyIn, OTPRequestOut
from app.schemas.user import UserOut, UserProfileIn, UserProfileOut, UserUpdate
from app.services import auth_service, user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def read_current_user(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.patch("/me", response_model=UserOut)
async def patch_current_user(
    payload: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return user_service.update_user(db, current_user, payload)


@router.get("/me/profile", response_model=UserProfileOut)
async def read_current_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    profile = user_service.get_profile(db, current_user.id)
    if profile is None:
        # 404 here is meaningful information for the frontend to act on:
        # "this user hasn't completed onboarding yet, show the profile
        # form" is a different UI state than "here's their saved data."
        # Returning an empty/default UserProfileOut instead would hide
        # that distinction from the client.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile submitted yet.",
        )
    return profile


@router.put("/me/profile", response_model=UserProfileOut)
async def upsert_current_profile(
    payload: UserProfileIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return user_service.upsert_profile(db, current_user.id, payload)


# --- Backup contact: self-service account recovery ---
# A citizen adds a second verified contact (mobile if they signed up with
# email, or the reverse) while they still have access. If they later lose
# one, they simply log in with the other — /auth/verify-otp finds a user by
# either column.

@router.post("/me/contacts/request-otp", response_model=OTPRequestOut)
async def request_contact_otp(
    payload: ContactOTPIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    request_id, expires_in = await auth_service.request_contact_otp(
        db, current_user, payload.mobile_number, payload.email
    )
    return OTPRequestOut(request_id=request_id, expires_in=expires_in)


@router.post("/me/contacts/verify", response_model=UserOut)
async def verify_contact(
    payload: ContactVerifyIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return auth_service.verify_contact_otp(
        db, current_user, payload.code, payload.mobile_number, payload.email
    )
