"""
Export everything held about an account, or delete all of it.

⛔ `_OWNED` is the complete list of tables that hold a user's rows. A new
table that holds user data must be added here, or export will silently leave
it out and delete will silently leave it behind.
`test_every_user_table_is_exported_and_deleted` fails when one is missing.

Neither endpoint logs anything about the rows it touches.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.api.auth import login_limiter
from app.core.dependencies import get_current_user
from app.core.rate_limit import enforce
from app.core.security import verify_password
from app.db.session import get_db
from app.models.appointment import Appointment
from app.models.care_profile import CareProfile
from app.models.goal import GoalActivity, GoalCompletion, HealthGoal
from app.models.health_profile import HealthProfile
from app.models.intake import IntakeAssessment
from app.models.medication import Medication
from app.models.reminder import MedicationReminder
from app.models.user import User

router = APIRouter(prefix="/account", tags=["account"])

# Deletion order: children before the rows they point at.
_OWNED = (
    MedicationReminder,
    Medication,
    IntakeAssessment,
    Appointment,
    HealthProfile,
    CareProfile,
)

# Never exported: a password hash is not the person's data, and handing it out
# only makes it crackable offline.
_NEVER_EXPORTED = {"hashed_password"}


def _row(obj: Any) -> dict[str, Any]:
    return {
        attr.key: getattr(obj, attr.key)
        for attr in inspect(obj).mapper.column_attrs
        if attr.key not in _NEVER_EXPORTED
    }


def _goal_rows(user: User, db: Session) -> tuple[list[HealthGoal], list[GoalActivity], list[GoalCompletion]]:
    goals = db.query(HealthGoal).filter(HealthGoal.user_id == user.id).all()
    activities = (
        db.query(GoalActivity).filter(GoalActivity.goal_id.in_([g.id for g in goals])).all()
        if goals
        else []
    )
    completions = (
        db.query(GoalCompletion)
        .filter(GoalCompletion.activity_id.in_([a.id for a in activities]))
        .all()
        if activities
        else []
    )
    return goals, activities, completions


@router.get("/export")
def export_account(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    goals, activities, completions = _goal_rows(user, db)
    data: dict[str, Any] = {
        "exported_at": datetime.now(timezone.utc),
        "account": _row(user),
        **{
            model.__tablename__: [
                _row(obj) for obj in db.query(model).filter(model.user_id == user.id)
            ]
            for model in _OWNED
        },
        HealthGoal.__tablename__: [_row(g) for g in goals],
        GoalActivity.__tablename__: [_row(a) for a in activities],
        GoalCompletion.__tablename__: [_row(c) for c in completions],
    }
    return jsonable_encoder(data)


class DeleteAccountIn(BaseModel):
    password: str


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """
    Irreversible, so it asks for the password again: a token left in an
    unattended browser tab must not be enough to erase someone's records.
    Guesses spend from the same budget as sign-in.
    """
    enforce(login_limiter, request)
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=403, detail="That password is not right.")

    goals, activities, completions = _goal_rows(user, db)
    # ⛔ Explicitly, children first. SQLite does not enforce the cascade.
    for rows in (completions, activities, goals):
        for obj in rows:
            db.delete(obj)
    db.flush()
    for model in _OWNED:
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
