"""
Daily check-ins and their trend (owner decision 5). See the model note.

Same rules as every other module: every query filters on the authenticated
user, a `profile_id` goes through `owned_profile_id`, nothing is logged.
"""

from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.profiles import owned_profile_id, profile_filter
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.check_in import CheckIn
from app.models.user import User

router = APIRouter(prefix="/check-ins", tags=["check-ins"])

MAX_DAYS = 365


class CheckInIn(BaseModel):
    day: date
    feeling: Literal["better", "same", "worse"]
    note: str | None = Field(None, max_length=1000)

    @field_validator("day")
    @classmethod
    def _not_future(cls, value: date) -> date:
        if value > date.today() + timedelta(days=1):
            raise ValueError("A check-in can't be for a future day.")
        return value

    @field_validator("note")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class CheckInOut(BaseModel):
    id: str
    day: date
    feeling: str
    note: str | None
    created_at: datetime
    # True for "worse": the client offers a new symptom check straight away.
    suggest_symptom_check: bool = False

    model_config = {"from_attributes": True}


def _out(row: CheckIn) -> CheckInOut:
    out = CheckInOut.model_validate(row)
    out.suggest_symptom_check = row.feeling == "worse"
    return out


def reported_worse_recently(user: User, profile_id: str | None, db: Session) -> bool:
    """A "worse" from today or yesterday, for this person. Read by intake."""
    since = date.today() - timedelta(days=1)
    return (
        db.query(CheckIn.id)
        .filter(
            CheckIn.user_id == user.id,
            profile_filter(CheckIn.profile_id, profile_id),
            CheckIn.day >= since,
            CheckIn.feeling == "worse",
        )
        .first()
        is not None
    )


@router.get("", response_model=list[CheckInOut])
def list_check_ins(
    profile_id: str | None = None,
    days: int = Query(30, ge=1, le=MAX_DAYS),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CheckInOut]:
    scoped = owned_profile_id(profile_id, user, db)
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(CheckIn)
        .filter(
            CheckIn.user_id == user.id,
            profile_filter(CheckIn.profile_id, scoped),
            CheckIn.day >= since,
        )
        .order_by(CheckIn.day.desc())
        .all()
    )
    return [_out(row) for row in rows]


@router.post("", response_model=CheckInOut)
def record_check_in(
    payload: CheckInIn,
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CheckInOut:
    """One per person per day; answering again that day replaces the answer."""
    scoped = owned_profile_id(profile_id, user, db)
    row = (
        db.query(CheckIn)
        .filter(
            CheckIn.user_id == user.id,
            profile_filter(CheckIn.profile_id, scoped),
            CheckIn.day == payload.day,
        )
        .first()
    )
    if row is None:
        row = CheckIn(user_id=user.id, profile_id=scoped, day=payload.day)
        db.add(row)
    row.feeling = payload.feeling
    row.note = payload.note
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{check_in_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_check_in(
    check_in_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    deleted = (
        db.query(CheckIn)
        .filter(CheckIn.id == check_in_id, CheckIn.user_id == user.id)
        .delete()
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Check-in not found.")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
