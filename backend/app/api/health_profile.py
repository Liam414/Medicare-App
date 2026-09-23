"""
The health profile: conditions and allergies for one person.

Same two rules as every other module here: every query filters on the
authenticated user, and a `profile_id` from a request goes through
`owned_profile_id` and nowhere else. Nothing here logs a value.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.profiles import owned_profile_id, profile_filter
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.health_profile import HealthProfile
from app.models.user import User
from app.schemas.health_profile import HealthProfileIn, HealthProfileOut

router = APIRouter(prefix="/health-profile", tags=["health-profile"])


def load_health_profile(user: User, profile_id: str | None, db: Session) -> HealthProfile | None:
    """For other features to read. `profile_id` must already be owned-checked."""
    return (
        db.query(HealthProfile)
        .filter(
            HealthProfile.user_id == user.id,
            profile_filter(HealthProfile.profile_id, profile_id),
        )
        .first()
    )


def _out(row: HealthProfile | None) -> HealthProfileOut:
    if row is None:
        return HealthProfileOut(conditions=[], allergies=[])
    return HealthProfileOut(
        conditions=row.conditions, allergies=row.allergies, updated_at=row.updated_at
    )


@router.get("", response_model=HealthProfileOut)
def get_health_profile(
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HealthProfileOut:
    scoped = owned_profile_id(profile_id, user, db)
    return _out(load_health_profile(user, scoped, db))


@router.put("", response_model=HealthProfileOut)
def put_health_profile(
    payload: HealthProfileIn,
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HealthProfileOut:
    scoped = owned_profile_id(profile_id, user, db)
    row = load_health_profile(user, scoped, db)
    if row is None:
        row = HealthProfile(user_id=user.id, profile_id=scoped)
        db.add(row)
    row.conditions = payload.conditions
    row.allergies = payload.allergies
    db.commit()
    db.refresh(row)
    return _out(row)
