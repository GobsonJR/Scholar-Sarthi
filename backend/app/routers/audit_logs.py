from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_officer
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.notification import AuditLogOut

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    db: Session = Depends(get_db),
    officer: User = Depends(require_officer),
    application_id: str | None = None,
):
    query = db.query(AuditLog)
    if application_id:
        query = query.filter(AuditLog.application_id == application_id)
    return query.order_by(AuditLog.created_at.desc()).limit(300).all()
