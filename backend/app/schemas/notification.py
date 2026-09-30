from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    title: str
    message: str
    type: str
    application_id: str | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: str
    actor_name: str
    action: str
    application_id: str | None
    details: str
    created_at: datetime

    model_config = {"from_attributes": True}
