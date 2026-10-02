"""
services/admin_account_service.py

Everything about getting back into an account, for both identity systems:

  Admins (email + password)
    - forgot_password()/reset_password(): a 6-digit code emailed to the
      admin, exchanged for a new password. Same "never reveal whether the
      email exists" rule as admin login — forgot_password() behaves
      identically for unknown emails.
    - change_password(): logged-in admin rotates their own password.
    - create_admin()/update_admin(): super admins manage other admins
      (there is no public admin signup).

  Citizens (OTP, no password — nothing to "forget")
    - Self-service: link a backup contact while they still have access
      (auth_service.request_contact_otp / verify_contact_otp).
    - Lost every contact: submit_recovery_request() files a request; a
      super admin verifies identity offline and approve_recovery() moves
      the account to the new contact and signs it out everywhere.

Route handlers stay thin, as in auth_service.py.
"""

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.exceptions import InvalidCredentials, OTPDeliveryFailed, OTPExpired, TooManyAttempts
from app.core.security import generate_otp, hash_otp, hash_password, verify_password
from app.models.account_recovery import AccountRecoveryRequest, AdminPasswordReset, RecoveryStatus
from app.models.admin import Admin, AdminRole
from app.models.user import User
from app.services import audit_service, auth_service, email_service

RESET_CODE_TTL_MINUTES = 15
RESET_CODE_ATTEMPT_LIMIT = 5
RESET_REQUEST_LIMIT = 3
RESET_REQUEST_WINDOW_SECONDS = 15 * 60

MOBILE_RE = re.compile(r"[6-9]\d{9}")
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _reset_hash_key(email: str) -> str:
    # Namespaced so an admin reset code can never collide with a citizen
    # OTP hash for the same email.
    return f"admin-reset:{email.lower()}"


def validate_new_password(password: str) -> None:
    """Minimum bar for an account that can see every citizen's data."""
    problems = []
    if len(password) < 10:
        problems.append("at least 10 characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        problems.append("both letters and numbers")
    if len(password.encode()) > 72:
        problems.append("at most 72 bytes (bcrypt limit)")
    if problems:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must have {', '.join(problems)}.",
        )


# --- Admin password reset ---

async def forgot_password(db: Session, email: str, ip_address: str | None) -> None:
    email = email.strip().lower()
    await rate_limit.enforce_limit(
        f"admin_reset:{email}",
        RESET_REQUEST_LIMIT,
        RESET_REQUEST_WINDOW_SECONDS,
        "Too many reset requests for this email. Try again in 15 minutes.",
    )
    admin = db.scalar(select(Admin).where(func.lower(Admin.email) == email))
    if admin is None or not admin.is_active:
        return  # same response as success — see module docstring

    code = generate_otp()
    db.add(
        AdminPasswordReset(
            admin_id=admin.id,
            code_hash=hash_otp(code, _reset_hash_key(admin.email)),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_CODE_TTL_MINUTES),
        )
    )
    audit_service.log_action(
        db, actor_type="admin", actor_id=admin.id, action="admin.password_reset_requested",
        target_type="admin", target_id=admin.id, ip_address=ip_address,
    )
    try:
        await email_service.send_admin_reset_email(admin.email, code, RESET_CODE_TTL_MINUTES)
    except email_service.EmailDeliveryError as exc:
        db.rollback()
        raise OTPDeliveryFailed("Could not send the reset email right now. Please try again shortly.") from exc
    db.commit()


def reset_password(db: Session, email: str, code: str, new_password: str, ip_address: str | None) -> None:
    validate_new_password(new_password)
    email = email.strip().lower()
    admin = db.scalar(select(Admin).where(func.lower(Admin.email) == email))
    reset = None
    if admin is not None:
        reset = db.scalar(
            select(AdminPasswordReset)
            .where(AdminPasswordReset.admin_id == admin.id, AdminPasswordReset.used_at.is_(None))
            .order_by(AdminPasswordReset.created_at.desc())
        )
    if admin is None or not admin.is_active or reset is None:
        raise InvalidCredentials("Invalid or expired reset code.")
    if reset.expires_at < datetime.now(timezone.utc):
        raise OTPExpired("This reset code has expired. Please request a new one.")
    if reset.attempts >= RESET_CODE_ATTEMPT_LIMIT:
        raise TooManyAttempts("Too many incorrect attempts. Please request a new reset code.")
    if hash_otp(code, _reset_hash_key(admin.email)) != reset.code_hash:
        reset.attempts += 1
        db.commit()
        raise InvalidCredentials("Invalid or expired reset code.")

    now = datetime.now(timezone.utc)
    reset.used_at = now
    # Any other outstanding codes for this admin die with this reset.
    for other in db.scalars(
        select(AdminPasswordReset).where(
            AdminPasswordReset.admin_id == admin.id, AdminPasswordReset.used_at.is_(None)
        )
    ):
        other.used_at = now
    admin.hashed_password = hash_password(new_password)
    audit_service.log_action(
        db, actor_type="admin", actor_id=admin.id, action="admin.password_reset",
        target_type="admin", target_id=admin.id, ip_address=ip_address,
    )
    db.commit()


def change_password(
    db: Session, admin: Admin, current_password: str, new_password: str, ip_address: str | None
) -> None:
    if not verify_password(current_password, admin.hashed_password):
        raise InvalidCredentials("Current password is incorrect.")
    validate_new_password(new_password)
    admin.hashed_password = hash_password(new_password)
    audit_service.log_action(
        db, actor_type="admin", actor_id=admin.id, action="admin.password_change",
        target_type="admin", target_id=admin.id, ip_address=ip_address,
    )
    db.commit()


# --- Admin management (super admin only — enforced at the route) ---

def create_admin(
    db: Session, actor: Admin, email: str, role: AdminRole, password: str, ip_address: str | None
) -> Admin:
    email = email.strip().lower()
    validate_new_password(password)
    if db.scalar(select(Admin).where(func.lower(Admin.email) == email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An admin with this email already exists.")
    admin = Admin(email=email, hashed_password=hash_password(password), role=role, is_active=True)
    db.add(admin)
    db.flush()
    audit_service.log_action(
        db, actor_type="admin", actor_id=actor.id, action="admin.create",
        target_type="admin", target_id=admin.id, extra_data={"role": role.value}, ip_address=ip_address,
    )
    db.commit()
    db.refresh(admin)
    return admin


def update_admin(
    db: Session,
    actor: Admin,
    admin_id: uuid.UUID,
    role: AdminRole | None,
    is_active: bool | None,
    ip_address: str | None,
) -> Admin:
    admin = db.get(Admin, admin_id)
    if admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found.")
    if admin.id == actor.id and (is_active is False or (role is not None and role != AdminRole.SUPER_ADMIN)):
        # Stops the last super admin from locking everyone out by accident.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't deactivate or demote your own account.",
        )
    changes = {}
    if role is not None and role != admin.role:
        changes["role"] = [admin.role.value, role.value]
        admin.role = role
    if is_active is not None and is_active != admin.is_active:
        changes["is_active"] = [admin.is_active, is_active]
        admin.is_active = is_active
    if changes:
        audit_service.log_action(
            db, actor_type="admin", actor_id=actor.id, action="admin.update",
            target_type="admin", target_id=admin.id, extra_data=changes, ip_address=ip_address,
        )
        db.commit()
        db.refresh(admin)
    return admin


# --- Citizen recovery requests ---

def normalize_contact(value: str) -> tuple[str | None, str | None]:
    """Returns (mobile_number, email) — exactly one set — or raises 422."""
    value = value.strip()
    digits = re.sub(r"[\s-]", "", value)
    if digits.startswith("+91"):
        digits = digits[3:]
    if MOBILE_RE.fullmatch(digits):
        return digits, None
    if EMAIL_RE.fullmatch(value):
        return None, value.lower()
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Enter a valid email address or 10-digit mobile number.",
    )


async def submit_recovery_request(
    db: Session,
    full_name: str | None,
    registered_contact: str,
    new_contact: str,
    details: str | None,
    ip_address: str | None,
) -> None:
    await rate_limit.enforce_limit(
        f"recovery_request:{ip_address or 'unknown'}", 5, 60 * 60,
        "Too many recovery requests. Please try again in an hour.",
    )
    old_mobile, old_email = normalize_contact(registered_contact)
    new_mobile, new_email = normalize_contact(new_contact)
    matched = db.scalar(
        select(User).where(User.mobile_number == old_mobile if old_mobile else User.email == old_email)
    )
    db.add(
        AccountRecoveryRequest(
            full_name=(full_name or "").strip() or None,
            registered_contact=old_mobile or old_email,
            new_contact=new_mobile or new_email,
            details=(details or "").strip() or None,
            matched_user_id=matched.id if matched else None,
        )
    )
    db.commit()


def _pending_request(db: Session, request_id: uuid.UUID) -> AccountRecoveryRequest:
    req = db.get(AccountRecoveryRequest, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery request not found.")
    if req.status != RecoveryStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This request is already {req.status}.")
    return req


def approve_recovery(
    db: Session, actor: Admin, request_id: uuid.UUID, note: str | None, ip_address: str | None
) -> AccountRecoveryRequest:
    req = _pending_request(db, request_id)
    if req.matched_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account uses the registered contact in this request — reject it instead.",
        )
    user = db.get(User, req.matched_user_id)
    new_mobile, new_email = normalize_contact(req.new_contact)
    clash = db.scalar(
        select(User).where(
            User.id != user.id,
            User.mobile_number == new_mobile if new_mobile else User.email == new_email,
        )
    )
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The new contact already belongs to a different account.",
        )

    old_mobile, old_email = normalize_contact(req.registered_contact)
    # Replace the lost contact; if the new one is the other type, the lost
    # one is cleared so it can't be used to get back in.
    if old_mobile:
        user.mobile_number = None
    if old_email:
        user.email = None
    if new_mobile:
        user.mobile_number = new_mobile
    if new_email:
        user.email = new_email
    auth_service.revoke_all_refresh_tokens(db, user.id)

    req.status = RecoveryStatus.APPROVED
    req.reviewed_by = actor.id
    req.review_note = (note or "").strip() or None
    req.reviewed_at = datetime.now(timezone.utc)
    audit_service.log_action(
        db, actor_type="admin", actor_id=actor.id, action="user.recovery_approved",
        target_type="user", target_id=user.id,
        extra_data={"request_id": str(req.id), "from": req.registered_contact, "to": req.new_contact},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(req)
    return req


def reject_recovery(
    db: Session, actor: Admin, request_id: uuid.UUID, note: str | None, ip_address: str | None
) -> AccountRecoveryRequest:
    req = _pending_request(db, request_id)
    req.status = RecoveryStatus.REJECTED
    req.reviewed_by = actor.id
    req.review_note = (note or "").strip() or None
    req.reviewed_at = datetime.now(timezone.utc)
    audit_service.log_action(
        db, actor_type="admin", actor_id=actor.id, action="user.recovery_rejected",
        target_type="recovery_request", target_id=req.id, ip_address=ip_address,
    )
    db.commit()
    db.refresh(req)
    return req
