"""
services/sms_service.py

Sends OTP codes via SMS. Two modes, switched by settings.SMS_MODE:

  - "live": real HTTP call to MSG91.
  - "mock": prints the OTP to the console instead of sending anything.
            This is the default for local development so you're never
            blocked on a real SMS during testing, and never burn MSG91
            credits by accident.

Nothing outside this file should know or care which mode is active —
services/auth_service.py just calls send_otp() and gets a bool back.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class SMSDeliveryError(Exception):
    """
    Raised when MSG91 is unreachable or rejects the send.

    This is a plain Python exception, not an HTTPException — same
    separation-of-concerns reasoning as core/security.py. This module
    doesn't know it's being called from a web request; auth_service.py is
    what decides "MSG91 is down" should become a 503 to the client.
    """


async def send_otp(mobile_number: str, code: str) -> bool:
    """
    Send an OTP code to a mobile number. Returns True on confirmed send.

    Deliberately async (uses httpx.AsyncClient, not requests) because
    FastAPI route handlers are async, and calling a blocking HTTP library
    from inside an async function would block the entire event loop —
    freezing every other in-flight request on the server while waiting on
    MSG91's response, not just this one. httpx is the async-native
    equivalent of requests, built for exactly this situation.
    """
    if settings.sms_mode == "mock":
        return _send_mock(mobile_number, code)
    return await _send_live(mobile_number, code)


def _send_mock(mobile_number: str, code: str) -> bool:
    """
    Local-dev stand-in: prints the OTP instead of sending it. Using
    logger.info (not a bare print) so this respects the app's normal
    logging configuration and shows up wherever your other logs do,
    rather than being an inconsistent one-off print statement.
    """
    logger.info("[MOCK SMS] OTP for %s is %s", mobile_number, code)
    return True


async def _send_live(mobile_number: str, code: str) -> bool:
    """
    Real MSG91 send. template_id is required, not optional — see the
    module docstring on DLT: MSG91 will reject a request without a
    registered template_id, so there's no code path here that sends
    free-text SMS content.
    """
    payload = {
        "template_id": settings.msg91_template_id,
        "mobile": f"91{mobile_number}",
        "authkey": settings.msg91_api_key,
        "otp": code,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                "https://control.msg91.com/api/v5/otp",
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        # Caught and re-raised as our own exception type, not left as a raw
        # httpx exception — this is the boundary between "MSG91's client
        # library's error types" and "this application's error types."
        # auth_service.py should only ever need to know about
        # SMSDeliveryError, not about httpx internals — if we ever swap
        # MSG91 for a different SMS provider later, only this file changes.
        logger.error("MSG91 send failed for %s: %s", mobile_number, exc)
        raise SMSDeliveryError(f"Failed to send OTP via MSG91: {exc}") from exc

    return True