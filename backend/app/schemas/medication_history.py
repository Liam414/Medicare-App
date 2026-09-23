from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, field_validator

from app.schemas.reminder import TIME_PATTERN


class DoseIn(BaseModel):
    """What the person tapped: this dose was taken, or they skipped it."""

    taken_on: date
    # "" when the dose is not tied to a reminder time.
    time_of_day: str = ""
    status: Literal["taken", "skipped"]

    @field_validator("time_of_day")
    @classmethod
    def _time(cls, value: str) -> str:
        value = value.strip()
        if value and not TIME_PATTERN.match(value):
            raise ValueError("Times must be in 24-hour HH:MM format, for example 08:00.")
        return value

    @field_validator("taken_on")
    @classmethod
    def _not_future(cls, value: date) -> date:
        # A day of slack for timezones: the client sends its local date.
        if value > date.today() + timedelta(days=1):
            raise ValueError("A dose can't be marked for a future day.")
        return value


class DoseOut(BaseModel):
    id: str
    taken_on: date
    time_of_day: str
    status: str

    model_config = {"from_attributes": True}


class ChangeOut(BaseModel):
    changed_at: datetime
    changes: dict[str, list]

    model_config = {"from_attributes": True}


class MedicationHistoryOut(BaseModel):
    started_on: date | None
    stopped_on: date | None
    doses: list[DoseOut]
    changes: list[ChangeOut]
