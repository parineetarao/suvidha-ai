"""
admin_ui/views.py

The browsable sqladmin panel — session-cookie authenticated, separate
from the JWT-based /admin/* JSON API in api/v1/admin.py. See that file's
module docstring for why both exist.

This module doesn't create the FastAPI app itself (that's main.py,
Member 3's file) — it exports register_admin_views(app, engine,
session_factory, secret_key), which main.py calls once at startup to
wire everything in. Keeping the wiring as a function call, rather than
having this module reach out and grab a global `app` object, means this
file has no import-order dependency on main.py — main.py imports FROM
here, not the other way around.
"""

from sqladmin import Admin as SQLAdminPanel
from sqladmin import ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.core.security import verify_password
from app.models.admin import Admin
from app.models.audit import AuditLog
from app.models.user import User


class AdminAuth(AuthenticationBackend):
    """
    sqladmin's session-cookie login. Requires Starlette's SessionMiddleware
    to be added to the app (main.py's job — one line:
    `app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET)`)
    since request.session below depends on that middleware existing.
    """

    def __init__(self, secret_key: str, session_factory: sessionmaker):
        super().__init__(secret_key=secret_key)
        self._session_factory = session_factory

    async def login(self, request: Request) -> bool:
        form = await request.form()
        email, password = form.get("username"), form.get("password")

        db = self._session_factory()
        try:
            admin = db.scalar(select(Admin).where(Admin.email == email))
            if admin is None or not admin.is_active:
                return False
            if not verify_password(password, admin.hashed_password):
                return False
            # Only the admin's own id goes in the session, never anything
            # sensitive — same minimal-session-data principle as putting
            # only `sub` and `roles` in a JWT, not the whole user record.
            request.session.update({"admin_id": str(admin.id)})
            return True
        finally:
            db.close()

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        """
        Called on every request to a panel page, not just login. Currently
        just checks the session has an admin_id at all — a stricter
        version would re-query the Admin table on every request to catch
        an admin being deactivated mid-session, at the cost of a DB
        round-trip per page view. Flagging this as a known simplification
        rather than silently leaving it unstated: for this project's
        scope, a deactivated admin's existing browser session staying
        valid until it naturally expires is an acceptable tradeoff.
        """
        return bool(request.session.get("admin_id"))


class UserAdminView(ModelView, model=User):
    """Read-only in this panel — edits to citizen data should go through
    the actual /users/* citizen-facing API, not be hand-edited by an
    admin clicking through a generic form."""

    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"
    column_list = [
        User.id,
        User.mobile_number,
        User.full_name,
        User.is_verified,
        User.created_at,
        User.last_login_at,
    ]
    can_create = False
    can_edit = False
    can_delete = False


class AuditLogAdminView(ModelView, model=AuditLog):
    """Fully read-only, always — an audit log you can edit isn't an audit log."""

    name = "Audit Log"
    name_plural = "Audit Logs"
    icon = "fa-solid fa-file-shield"
    column_list = [
        AuditLog.id,
        AuditLog.actor_type,
        AuditLog.actor_id,
        AuditLog.action,
        AuditLog.target_type,
        AuditLog.target_id,
        AuditLog.ip_address,
        AuditLog.created_at,
    ]
    can_create = False
    can_edit = False
    can_delete = False


class AdminAdminView(ModelView, model=Admin):
    """
    Deliberately create=False, edit=False — see this file's module-level
    caveat above about sqladmin's forms not knowing to bcrypt-hash a
    password field. New admins are created via create_admin.py (Member
    3's script) instead, which can call core.security.hash_password()
    correctly before ever touching the database.
    """

    name = "Admin"
    name_plural = "Admins"
    icon = "fa-solid fa-user-shield"
    column_list = [Admin.id, Admin.email, Admin.role, Admin.is_active, Admin.created_at]
    column_exclude_list = [Admin.hashed_password]  # never render the hash, even read-only
    can_create = False
    can_edit = False
    can_delete = False


def register_admin_views(app, engine, session_factory: sessionmaker, secret_key: str) -> None:
    """
    Called once from main.py at startup:

        from app.admin_ui.views import register_admin_views
        register_admin_views(app, engine, SessionLocal, settings.JWT_SECRET)

    Reusing settings.JWT_SECRET as the session-signing secret rather than
    introducing a second secret is a reasonable simplification here (one
    less env var to manage) — a larger production system might use a
    dedicated SESSION_SECRET so rotating one doesn't invalidate the other.
    """
    auth_backend = AdminAuth(secret_key=secret_key, session_factory=session_factory)
    panel = SQLAdminPanel(app, engine, authentication_backend=auth_backend)

    panel.add_view(UserAdminView)
    panel.add_view(AuditLogAdminView)
    panel.add_view(AdminAdminView)