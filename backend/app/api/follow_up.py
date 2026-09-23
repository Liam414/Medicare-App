"""
Follow-up reminders, and health readings with the person's own targets.
See `app/models/follow_up.py` for what is and is not computed.

Same rules as every other module: every query filters on the authenticated
user, a `profile_id` goes through `owned_profile_id`, nothing is logged.
"""

from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.api.profiles import owned_profile_id, profile_filter
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.follow_up import READING_KINDS, FollowUp, HealthReading, HealthTarget
from app.models.user import User

follow_ups = APIRouter(prefix="/follow-ups", tags=["follow-ups"])
readings = APIRouter(prefix="/readings", tags=["readings"])

ReadingKind = Literal["blood_pressure", "weight", "blood_glucose", "steps"]

# Units accepted per kind, and entry bounds that catch a typo (an extra zero,
# a swapped field). ⛔ These are data-entry limits, not clinical thresholds:
# nothing anywhere tells the person a value is high, low, good or bad.
_UNITS: dict[str, dict[str, tuple[float, float]]] = {
    "weight": {"kg": (1, 400), "lb": (2, 900)},
    "blood_glucose": {"mg/dL": (10, 1500), "mmol/L": (0.5, 85)},
    "steps": {"steps": (0, 200_000)},
}
_BP_BOUNDS = {"systolic": (40, 300), "diastolic": (20, 200)}


def _scoped(profile_id: str | None, user: User, db: Session) -> str | None:
    return owned_profile_id(profile_id, user, db)


def _not_future(value: date) -> date:
    if value > date.today() + timedelta(days=1):
        raise ValueError("That date is in the future.")
    return value


# --- Follow-ups ------------------------------------------------------------


class FollowUpIn(BaseModel):
    kind: Literal["return_visit", "post_visit_check_in", "other"]
    title: str = Field(..., min_length=1, max_length=300)
    due_on: date

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Say what the follow-up is.")
        return value.strip()


class FollowUpOut(BaseModel):
    id: str
    kind: str
    title: str
    due_on: date
    done_on: date | None

    model_config = {"from_attributes": True}


class FollowUpPatch(BaseModel):
    done: bool


@follow_ups.get("", response_model=list[FollowUpOut])
def list_follow_ups(
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FollowUp]:
    """Open ones by due date, then anything done in the last 30 days."""
    scoped = _scoped(profile_id, user, db)
    rows = (
        db.query(FollowUp)
        .filter(FollowUp.user_id == user.id, profile_filter(FollowUp.profile_id, scoped))
        .all()
    )
    recent = date.today() - timedelta(days=30)
    open_rows = sorted((r for r in rows if r.done_on is None), key=lambda r: r.due_on)
    done_rows = sorted((r for r in rows if r.done_on and r.done_on >= recent), key=lambda r: r.done_on, reverse=True)
    return open_rows + done_rows


@follow_ups.post("", response_model=FollowUpOut, status_code=status.HTTP_201_CREATED)
def create_follow_up(
    payload: FollowUpIn,
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUp:
    row = FollowUp(user_id=user.id, profile_id=_scoped(profile_id, user, db), **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _owned_follow_up(follow_up_id: str, user: User, db: Session) -> FollowUp:
    row = db.query(FollowUp).filter(FollowUp.id == follow_up_id, FollowUp.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    return row


@follow_ups.patch("/{follow_up_id}", response_model=FollowUpOut)
def mark_follow_up(
    follow_up_id: str,
    payload: FollowUpPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUp:
    row = _owned_follow_up(follow_up_id, user, db)
    row.done_on = date.today() if payload.done else None
    db.commit()
    db.refresh(row)
    return row


@follow_ups.delete("/{follow_up_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_follow_up(
    follow_up_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.delete(_owned_follow_up(follow_up_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Readings and targets --------------------------------------------------


class ReadingIn(BaseModel):
    kind: ReadingKind
    taken_on: date
    systolic: int | None = None
    diastolic: int | None = None
    value: float | None = None
    unit: str | None = None

    @field_validator("taken_on")
    @classmethod
    def _taken_on(cls, value: date) -> date:
        return _not_future(value)

    @model_validator(mode="after")
    def _shape(self) -> "ReadingIn":
        if self.kind == "blood_pressure":
            for name, (low, high) in _BP_BOUNDS.items():
                number = getattr(self, name)
                if number is None or not low <= number <= high:
                    raise ValueError(f"Enter the {name} number as shown on the monitor.")
            return self
        bounds = _UNITS[self.kind].get(self.unit or "")
        if bounds is None:
            raise ValueError(f"Unit must be one of: {', '.join(_UNITS[self.kind])}.")
        if self.value is None or not bounds[0] <= self.value <= bounds[1]:
            raise ValueError("That number looks mistyped. Check it and try again.")
        return self

    def stored_value(self) -> dict:
        if self.kind == "blood_pressure":
            return {"systolic": self.systolic, "diastolic": self.diastolic, "unit": "mmHg"}
        return {"value": self.value, "unit": self.unit}


class ReadingOut(BaseModel):
    id: str
    kind: str
    taken_on: date
    value: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class TargetIn(BaseModel):
    target_text: str | None = Field(None, max_length=200)
    remind_every_days: int | None = Field(None, ge=1, le=365)

    @field_validator("target_text")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return (value.strip() or None) if value else None


class KindSummary(BaseModel):
    kind: str
    # Verbatim, as the person typed it. Never compared with a reading.
    target_text: str | None
    remind_every_days: int | None
    last_taken_on: date | None
    # Date arithmetic only: asked to be reminded every N days, and it has
    # been at least N days (or there has never been a reading).
    due: bool
    days_since: int | None


class ReadingsOut(BaseModel):
    summaries: list[KindSummary]
    readings: list[ReadingOut]


def summarise(user: User, scoped: str | None, db: Session, today: date | None = None) -> list[KindSummary]:
    """One line per kind that has a target or a reading. Used by Today too."""
    today = today or date.today()
    targets = {
        t.kind: t
        for t in db.query(HealthTarget).filter(
            HealthTarget.user_id == user.id, profile_filter(HealthTarget.profile_id, scoped)
        )
    }
    last: dict[str, date] = {}
    for kind, taken_on in db.query(HealthReading.kind, HealthReading.taken_on).filter(
        HealthReading.user_id == user.id, profile_filter(HealthReading.profile_id, scoped)
    ):
        if kind not in last or taken_on > last[kind]:
            last[kind] = taken_on

    out = []
    for kind in READING_KINDS:
        target = targets.get(kind)
        if target is None and kind not in last:
            continue
        every = target.remind_every_days if target else None
        since = (today - last[kind]).days if kind in last else None
        out.append(
            KindSummary(
                kind=kind,
                target_text=target.target_text if target else None,
                remind_every_days=every,
                last_taken_on=last.get(kind),
                due=every is not None and (since is None or since >= every),
                days_since=since,
            )
        )
    return out


@readings.get("", response_model=ReadingsOut)
def list_readings(
    profile_id: str | None = None,
    kind: ReadingKind | None = None,
    days: int = Query(90, ge=1, le=730),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReadingsOut:
    scoped = _scoped(profile_id, user, db)
    query = db.query(HealthReading).filter(
        HealthReading.user_id == user.id,
        profile_filter(HealthReading.profile_id, scoped),
        HealthReading.taken_on >= date.today() - timedelta(days=days),
    )
    if kind:
        query = query.filter(HealthReading.kind == kind)
    rows = query.order_by(HealthReading.taken_on.desc(), HealthReading.created_at.desc()).all()
    return ReadingsOut(
        summaries=summarise(user, scoped, db),
        readings=[ReadingOut.model_validate(r) for r in rows],
    )


@readings.post("", response_model=ReadingOut, status_code=status.HTTP_201_CREATED)
def log_reading(
    payload: ReadingIn,
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HealthReading:
    row = HealthReading(
        user_id=user.id,
        profile_id=_scoped(profile_id, user, db),
        kind=payload.kind,
        taken_on=payload.taken_on,
        value=payload.stored_value(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@readings.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(
    reading_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    deleted = (
        db.query(HealthReading)
        .filter(HealthReading.id == reading_id, HealthReading.user_id == user.id)
        .delete()
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Reading not found.")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@readings.put("/targets/{kind}", response_model=list[KindSummary])
def set_target(
    kind: ReadingKind,
    payload: TargetIn,
    profile_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[KindSummary]:
    """The person's target (their clinician's figure, as typed) and reminder
    interval. Both blank removes it."""
    scoped = _scoped(profile_id, user, db)
    row = (
        db.query(HealthTarget)
        .filter(
            HealthTarget.user_id == user.id,
            profile_filter(HealthTarget.profile_id, scoped),
            HealthTarget.kind == kind,
        )
        .first()
    )
    if payload.target_text is None and payload.remind_every_days is None:
        if row is not None:
            db.delete(row)
    else:
        if row is None:
            row = HealthTarget(user_id=user.id, profile_id=scoped, kind=kind)
            db.add(row)
        row.target_text = payload.target_text
        row.remind_every_days = payload.remind_every_days
    db.commit()
    return summarise(user, scoped, db)
