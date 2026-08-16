"""
services/application_service.py

Owns the six-state application lifecycle:
draft -> docs_pending -> letter_generated -> submitted -> under_review ->
approved | rejected (plus one deliberate backward edge, see TRANSITIONS).

Every transition, without exception, writes a row to
application_status_history — that's the whole point of keeping that table:
an admin or a citizen can always answer "what happened to my application
and when," not just "what is its current status right now."

Route handlers (api/v1/applications.py, step 18) should call these
functions and do no state-machine logic of their own. transition_status()
is the only place in this codebase allowed to write Application.status.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ApplicationNotFound, InvalidTransition
from app.models.application import Application, ApplicationStatusHistory
from app.schemas.application import ApplicationUpdate

# Allowed forward transitions, plus one deliberate backward edge. "approved"
# is a true terminal state — a granted scheme benefit isn't undone through
# this app. "rejected" is not terminal: models/application.py's
# UniqueConstraint("user_id", "scheme_id") means a citizen re-applying to a
# scheme they were previously rejected for reuses this SAME row rather than
# creating a second one, so "rejected -> draft" is how that reuse is
# expressed as a validated, logged transition instead of a raw UPDATE that
# would bypass history entirely.
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"docs_pending"},
    "docs_pending": {"letter_generated"},
    "letter_generated": {"submitted"},
    "submitted": {"under_review"},
    "under_review": {"approved", "rejected"},
    "approved": set(),
    "rejected": {"draft"},
}


def create_application(db: Session, user_id: uuid.UUID, scheme_id: uuid.UUID) -> Application:
    """
    POST /applications. Idempotent by design: if this citizen already has a
    row for this scheme, returns it rather than raising a conflict —
    retrying a POST after a dropped connection (common on the rural mobile
    networks this app targets) should never fail just because it isn't the
    first attempt. The one exception is a previously-rejected application,
    which is reactivated back to "draft" so the citizen can try again on the
    same row (see the TRANSITIONS comment above).
    """
    existing = db.scalar(
        select(Application).where(Application.user_id == user_id, Application.scheme_id == scheme_id)
    )
    if existing is not None:
        if existing.status == "rejected":
            return transition_status(db, existing, "draft", changed_by=user_id)
        return existing

    application = Application(user_id=user_id, scheme_id=scheme_id, status="draft")
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def list_applications(db: Session, user_id: uuid.UUID) -> list[Application]:
    """GET /applications — a citizen only ever sees their own, newest first."""
    return list(
        db.scalars(
            select(Application)
            .where(Application.user_id == user_id)
            .order_by(Application.created_at.desc())
        )
    )


def get_owned_application(db: Session, application_id: uuid.UUID, user_id: uuid.UUID) -> Application:
    """
    Fetch-and-authorize in one step for GET/PATCH/DELETE /applications/{id}.
    Raises ApplicationNotFound (404) both when the row genuinely doesn't
    exist and when it belongs to a different user — see that exception's
    docstring for why those two cases are deliberately indistinguishable
    from the outside.
    """
    application = db.scalar(
        select(Application).where(Application.id == application_id, Application.user_id == user_id)
    )
    if application is None:
        raise ApplicationNotFound()
    return application


def get_status_history(db: Session, application_id: uuid.UUID) -> list[ApplicationStatusHistory]:
    """Oldest-first, for rendering a timeline top-to-bottom in ApplicationDetail."""
    return list(
        db.scalars(
            select(ApplicationStatusHistory)
            .where(ApplicationStatusHistory.application_id == application_id)
            .order_by(ApplicationStatusHistory.changed_at.asc())
        )
    )


def transition_status(
    db: Session,
    application: Application,
    new_status: str,
    changed_by: uuid.UUID | None = None,
) -> Application:
    """
    Validates new_status against TRANSITIONS for the application's current
    status, stamps submitted_at when entering "submitted" (the one status
    with its own timestamp column), and always appends an
    ApplicationStatusHistory row — including for the rejected->draft
    reactivation, so history stays a complete record rather than a log with
    gaps.
    """
    old_status = application.status
    allowed = TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        raise InvalidTransition(
            f"Cannot move an application from '{old_status}' to '{new_status}'."
        )

    application.status = new_status
    if new_status == "submitted":
        application.submitted_at = datetime.now(timezone.utc)

    db.add(
        ApplicationStatusHistory(
            application_id=application.id,
            old_status=old_status,
            new_status=new_status,
            changed_by=changed_by,
        )
    )

    db.commit()
    db.refresh(application)
    return application


def update_application(
    db: Session,
    application: Application,
    payload: ApplicationUpdate,
    changed_by: uuid.UUID | None = None,
) -> Application:
    """
    PATCH /applications/{id}. `notes` is a plain field update; `status` (if
    present) always goes through transition_status() rather than being set
    directly, so a PATCH can never silently skip the validation and
    history-logging a raw `application.status = ...` would bypass. Both
    changes land in a single commit when both are provided.
    """
    if payload.notes is not None:
        application.notes = payload.notes

    if payload.status is not None:
        return transition_status(db, application, payload.status, changed_by=changed_by)

    db.commit()
    db.refresh(application)
    return application


def delete_application(db: Session, application: Application) -> None:
    """DELETE /applications/{id}. Cascades to application_status_history via that table's ondelete=CASCADE."""
    db.delete(application)
    db.commit()
