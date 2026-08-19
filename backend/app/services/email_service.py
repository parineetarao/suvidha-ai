"""
services/email_service.py

Sends OTP codes via email — a free, no-DLT-registration alternative
identity path alongside SMS. Same mock/live pattern as sms_service.py.
"""

import logging
import smtplib
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    pass


async def send_otp_email(email: str, code: str) -> bool:
    if settings.email_mode == "mock":
        return _send_mock(email, code)
    return _send_live(email, code)


def _send_mock(email: str, code: str) -> bool:
    logger.info("[MOCK EMAIL] OTP for %s is %s", email, code)
    return True


def _send_live(email: str, code: str) -> bool:
    msg = MIMEText(f"Your SuvidhaAI verification code is: {code}\n\nThis code expires in 5 minutes.")
    msg["Subject"] = "Your SuvidhaAI verification code"
    msg["From"] = settings.email_from
    msg["To"] = email

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
    except smtplib.SMTPException as exc:
        logger.error("Email send failed for %s: %s", email, exc)
        raise EmailDeliveryError(f"Failed to send OTP email: {exc}") from exc

    return True