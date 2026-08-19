"""
schemas/auth.py

Pydantic models for the /auth/* endpoints. These are the request and
response shapes for the OTP-to-JWT flow — nothing here touches the
database directly; services/auth_service.py is what translates between
these shapes and the SQLAlchemy models.
"""

import re
import uuid

from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserOut
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

class OTPRequestIn(BaseModel):
    mobile_number: str | None = None
    email: EmailStr | None = None
    mode: str | None = None  # "login" or "register" — controls existence check

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.fullmatch(r"[6-9]\d{9}", v):
            raise ValueError("Enter a valid 10-digit Indian mobile number.")
        return v

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "OTPRequestIn":
        if bool(self.mobile_number) == bool(self.email):
            raise ValueError("Provide exactly one of mobile_number or email, not both or neither.")
        return self


class OTPVerifyIn(BaseModel):
    mobile_number: str | None = None
    email: EmailStr | None = None
    code: str = Field(..., min_length=6, max_length=6)
    full_name: str | None = None  # only used if this creates a new user

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("OTP code must be 6 digits.")
        return v

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "OTPVerifyIn":
        if bool(self.mobile_number) == bool(self.email):
            raise ValueError("Provide exactly one of mobile_number or email, not both or neither.")
        return self


class OTPRequestOut(BaseModel):
    """
    Response of POST /auth/request-otp.

    request_id lets the frontend correlate "which OTP request is this
    verify attempt for" without exposing the OTP row's real database ID
    unnecessarily — in practice these can be the same UUID, but keeping the
    field named request_id rather than otp_id keeps the API contract
    stable even if the underlying implementation changes later.
    """

    request_id: uuid.UUID
    expires_in: int = Field(description="Seconds until this OTP expires.")


class TokenPair(BaseModel):
    """
    Response of POST /auth/verify-otp and POST /auth/refresh.

    Only the access_token appears in the JSON body. The refresh_token is
    NEVER put in a JSON response — it's set directly as an httpOnly cookie
    by the route handler (api/v1/auth.py), which means client-side
    JavaScript can never read it, closing off a whole class of XSS-based
    token theft. Putting it here in the schema would defeat that; the
    schema intentionally does not have a refresh_token field.
    """

    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshTokenIn(BaseModel):
    """
    Body of POST /auth/refresh — included for completeness against the
    spec, but in practice this endpoint reads the refresh token from the
    httpOnly cookie (see TokenPair's docstring for why), not from a JSON
    body. This schema exists mainly to document the alternative path (e.g.
    a non-browser client like a CSC kiosk app that can't rely on cookies).
    """

    refresh_token: str | None = None


class AccessTokenOut(BaseModel):
    """
    Response of POST /auth/refresh. Deliberately NOT a TokenPair — refresh
    happens automatically in the background every ~15 minutes while a
    session is active, and re-fetching + re-serializing the full User
    object on every one of those calls would be a wasted DB query. The
    frontend already has the user's info from the original verify-otp
    response; refresh only needs to hand back a new access_token.
    """

    access_token: str
    token_type: str = "bearer"