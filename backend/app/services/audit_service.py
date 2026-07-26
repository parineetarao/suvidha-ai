"""
services/audit_service.py

Called by every admin action, everywhere admin data is viewed or changed.
One function, deliberately simple: log_action() just builds an AuditLog
row and adds it to the current session — it does NOT call db.commit().

That last point is the important design decision here: committing is left
to the CALLER (the route handler doing the actual admin action), so the
audit log entry commits in the same database transaction as the action it
describes. If that transaction rolls back for any reason, the audit log
entry rolls back with it — you never end up with a log entry describing
something that didn't actually happen, which would be worse than having
no log at all.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def log_action(
    db: Session,
    actor_type: str,
    actor_id: uuid.UUID,
    action: str,
    target_type: str,
    target_id: uuid.UUID | None = None,
    extra_data: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Stage an audit log entry. Does not commit — call this right alongside
    (before or after) the actual database change in the same route
    handler, and let that handler's own db.commit() cover both at once.

    action is a free-text string by convention, e.g. "user.view",
    "admin.login", "scheme.edit" — a "resource.verb" pattern. Not made
    into an Enum (unlike AdminRole in models/admin.py) because the set of
    possible actions will keep growing as Member 2 and Member 3 add their
    own admin-relevant actions, and a plain string means no Alembic
    migration is needed every time a new action type is introduced.
    """
    db.add(
        AuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            extra_data=extra_data,
            ip_address=ip_address,
        )
    )