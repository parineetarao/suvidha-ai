"""
core/exceptions.py

Custom exceptions for the auth flow. Unlike core/security.py, these ARE
allowed to know about HTTP — that's their entire job. Each one IS an
HTTPException subclass, so raising OTPExpired() anywhere in the service
layer is enough for FastAPI to automatically turn it into the right HTTP
response, with no extra exception-handler middleware needed. This is a
deliberate simplification for a project this size: in a larger system
you might keep exceptions HTTP-agnostic and translate them at the API
layer instead, but for SuvidhaAI's scope, raising these directly from
services/auth_service.py keeps the code shorter without losing clarity —
worth being able to name as a conscious tradeoff, not an oversight, if
asked in viva.
"""

from fastapi import HTTPException, status


class InvalidCredentials(HTTPException):
    """Wrong OTP code, or no matching OTP request found."""

    def __init__(self, detail: str = "Invalid mobile number or OTP code."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class OTPExpired(HTTPException):
    """The OTP existed but its 5-minute window has passed."""

    def __init__(self, detail: str = "This OTP has expired. Please request a new one."):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class TooManyAttempts(HTTPException):
    """
    Covers both: too many OTP *requests* for a mobile number (rate limit),
    and too many failed *verify* attempts against one OTP (5-attempt cap).
    Both are "you've been throttled," so one exception type covers both —
    the detail message is what tells them apart.
    """

    def __init__(self, detail: str = "Too many attempts. Please try again later."):
        super().__init__(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)


class TokenExpired(HTTPException):
    """Access token or refresh token has expired, or failed verification."""

    def __init__(self, detail: str = "Your session has expired. Please log in again."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class InsufficientRole(HTTPException):
    """Authenticated, but not authorized — a logged-in user hitting an admin-only route."""

    def __init__(self, detail: str = "You do not have permission to perform this action."):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class OTPDeliveryFailed(HTTPException):
    """
    Not in the original spec list, added here deliberately: this is the
    direct answer to "what happens if MSG91 is down." Rather than let that
    question have no answer, request_otp() in auth_service.py catches
    services.sms_service.SMSDeliveryError and re-raises it as this —
    a 503 tells the client (and the frontend) this is a temporary
    upstream problem, distinct from a 400/401 which would mean *they* did
    something wrong.
    """

    def __init__(self, detail: str = "SMS delivery is temporarily unavailable. Please try again shortly."):
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


# --- Member 3 (Application lifecycle) ---

class InvalidTransition(HTTPException):
    """Attempted an application status change the state machine doesn't
    allow (e.g. draft -> approved directly, skipping every step between).
    See services/application_service.py's TRANSITIONS graph."""

    def __init__(self, detail: str = "This status change is not allowed from the application's current state."):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class ApplicationNotFound(HTTPException):
    """No such application, or it exists but belongs to a different user —
    deliberately the same response either way. A 403 here would confirm to
    an attacker that a guessed application UUID exists and just isn't
    theirs; 404 reveals nothing. Same reasoning as InvalidCredentials
    above not distinguishing "no OTP" from "wrong code"."""

    def __init__(self, detail: str = "Application not found."):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)