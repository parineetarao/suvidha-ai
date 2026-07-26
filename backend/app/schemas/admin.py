"""
schemas/admin.py

Shapes for the /admin/* JSON API (distinct from admin_ui/views.py's
sqladmin session-based panel — see that file's docstring for why both
exist).
"""

import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

from app.models.admin import AdminRole

T = TypeVar("T")


class AdminLogin(BaseModel):
    """Body of POST /admin/auth/login."""

    email: str
    password: str


class AdminOut(BaseModel):
    id: uuid.UUID
    email: str
    role: AdminRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    """
    Lightweight user shape for GET /admin/users — deliberately thinner
    than schemas.user.UserOut. An admin browsing a list of hundreds of
    users doesn't need every field, and keeping this list-view schema
    separate from the citizen-facing UserOut means the two can evolve
    independently — e.g. if the admin list view later needs a field
    (like a computed "profile completeness %") that would make no sense
    on the citizen's own /users/me response.
    """

    id: uuid.UUID
    mobile_number: str
    full_name: str | None = None
    is_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    actor_type: str
    actor_id: uuid.UUID
    action: str
    target_type: str
    target_id: uuid.UUID | None = None
    extra_data: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalyticsOverview(BaseModel):
    users_total: int
    admin_actions_by_type: dict[str, int]


class PaginatedList(BaseModel, Generic[T]):
    """
    Generic wrapper for any paginated list response — used as
    PaginatedList[UserSummary] and PaginatedList[AuditLogOut]. Writing
    this once as a generic, instead of a separate PaginatedUsers and
    PaginatedAuditLogs class, means adding a third paginated endpoint
    later (e.g. paginated scheme list for Member 2) costs zero new code
    here — just PaginatedList[WhateverSchema].
    """

    items: list[T]
    total: int
    page: int
    page_size: int