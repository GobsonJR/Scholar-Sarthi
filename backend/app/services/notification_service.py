from sqlalchemy.orm import Session

from app.models.notification import Notification


def notify(
    db: Session,
    *,
    user_id: str,
    title: str,
    message: str,
    type: str = "INFO",
    application_id: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        application_id=application_id,
    )
    db.add(notification)
    db.flush()
    return notification
