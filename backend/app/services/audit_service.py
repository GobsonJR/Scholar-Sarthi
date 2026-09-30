from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def log_action(
    db: Session,
    *,
    actor_id: str | None,
    actor_name: str,
    action: str,
    application_id: str | None = None,
    details: str = "",
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        actor_name=actor_name,
        action=action,
        application_id=application_id,
        details=details,
    )
    db.add(entry)
    db.flush()
    return entry
