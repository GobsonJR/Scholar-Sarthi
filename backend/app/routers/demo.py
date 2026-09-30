from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.deps import require_officer
from app.models.user import User
from app.seed import seed

router = APIRouter(prefix="/demo", tags=["demo"])
settings = get_settings()


@router.post("/reset")
def reset_demo(officer: User = Depends(require_officer)):
    """Resets the database to the pristine seeded SIH demo state.

    Only available when DEMO_MODE=true (the default for this prototype).
    Requires an authenticated officer, so it can't be triggered by an
    anonymous request even in demo mode. In any deployment where resetting
    the database on demand is unsafe, set DEMO_MODE=false in .env and this
    endpoint returns 404 regardless of role.
    """
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    seed()
    return {"ok": True, "message": "Demo database reset to the seeded SIH demo state."}
