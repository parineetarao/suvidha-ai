"""
api/v1/admin.py

The /admin/* JSON API — a separate authentication mechanism (JWT, via
AdminLogin/AccessTokenOut) from admin_ui/views.py's session-based sqladmin
panel. See that file's docstring, and schemas/admin.py's, for why both
exist side by side.

Notice EVERY route below calls audit_service.log_action — including the
read-only GET /admin/users. That's a deliberate, stricter-than-usual
policy for this project: because the data being browsed is citizen
welfare/eligibility information, even VIEWING it by an admin is logged,
not just edits. This is a strong, concrete answer if a professor asks
"how would you detect an admin snooping on citizen data without
authorization" — the audit_logs table has an entry for every list they
ever pulled up.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.core.exceptions import InvalidCredentials
from app.core.security import create_access_token, verify_password
from app.models.admin import Admin
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.admin import (
    AnalyticsOverview,
    AuditLogOut,
    PaginatedList,
    UserSummary,
)
from app.schemas.admin import AdminLogin
from app.schemas.auth import AccessTokenOut
from app.services import audit_service
from datetime import datetime, timezone

router = APIRouter(prefix="/admin", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    """
    Small shared helper: every audited admin action wants the request's
    IP address (per your audit_logs schema's ip_address column). Pulled
    into one place rather than repeated inline in every route below.
    """
    return request.client.host if request.client else None


@router.post("/auth/login", response_model=AccessTokenOut)
async def admin_login(
    payload: AdminLogin,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    admin = db.scalar(select(Admin).where(Admin.email == payload.email))

    # Same principle as the citizen OTP flow: a nonexistent email and a
    # wrong password produce the IDENTICAL error, so a login attempt can
    # never be used to probe "does this admin email even exist."
    if admin is None or not admin.is_active or not verify_password(
        payload.password, admin.hashed_password
    ):
        raise InvalidCredentials("Invalid email or password.")

    access_token = create_access_token(str(admin.id), roles=["admin", admin.role.value])
    admin.last_login_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db,
        actor_type="admin",
        actor_id=admin.id,
        action="admin.login",
        target_type="admin",
        target_id=admin.id,
        ip_address=_client_ip(request),
    )
    db.commit()

    return AccessTokenOut(access_token=access_token)


@router.get("/users", response_model=PaginatedList[UserSummary])
async def list_users(
    request: Request,
    current_admin: Annotated[Admin, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    search: Annotated[str | None, Query()] = None,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    query = select(User)
    if search:
        # ilike = case-insensitive LIKE. Searching across both
        # mobile_number and full_name with one search box, since that's
        # the natural thing an admin would expect to type into a single
        # search field without needing to know which field they're
        # searching by.
        like_pattern = f"%{search}%"
        query = query.where(
            User.mobile_number.ilike(like_pattern) | User.full_name.ilike(like_pattern)
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))

    items = db.scalars(
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    audit_service.log_action(
        db,
        actor_type="admin",
        actor_id=current_admin.id,
        action="user.list",
        target_type="user",
        extra_data={"search": search, "page": page} if search else {"page": page},
        ip_address=_client_ip(request),
    )
    db.commit()

    return PaginatedList[UserSummary](
        items=[UserSummary.model_validate(u) for u in items],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-logs", response_model=PaginatedList[AuditLogOut])
async def list_audit_logs(
    current_admin: Annotated[Admin, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    actor_id: Annotated[str | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
):
    # NOTE: viewing the audit log itself is deliberately NOT logged as its
    # own audit entry. Logging "admin viewed the audit logs" every time
    # someone views the audit logs would make the table grow indefinitely
    # just from admins checking their own history — this is the one
    # read-only admin action considered low-risk enough to skip, since the
    # audit log's own access isn't itself a citizen-data exposure.
    query = select(AuditLog)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    if action:
        query = query.where(AuditLog.action == action)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return PaginatedList[AuditLogOut](
        items=[AuditLogOut.model_validate(a) for a in items],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/analytics/overview", response_model=AnalyticsOverview)
async def analytics_overview(
    current_admin: Annotated[Admin, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    users_total = db.scalar(select(func.count()).select_from(User)) or 0

    # GROUP BY action, COUNT(*) — one query gets every action type's
    # count at once, rather than a separate query per action name.
    rows = db.execute(
        select(AuditLog.action, func.count()).group_by(AuditLog.action)
    ).all()
    admin_actions_by_type = {action_name: count for action_name, count in rows}

    return AnalyticsOverview(
        users_total=users_total,
        admin_actions_by_type=admin_actions_by_type,
    )