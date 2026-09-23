"""
Follow-up care, targets and readings (owner decisions 5 and 6, 2026-09-22).

⛔ Every value here is something the person entered. MedHelp never proposes a
target, never compares a reading with one, and never says a reading is high,
low, good or bad — that is interpreting a clinical value, which this app may
not do. A target is stored exactly as typed ("130/80, from Dr Synthetic"),
because it is the clinician's figure relayed by the person, not MedHelp's.

The one thing MedHelp computes is arithmetic on dates: a reading is "due"
when the person asked to be reminded every N days and N days have passed.

Free text and values are encrypted at rest.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON
from app.db.base import Base

READING_KINDS = ("blood_pressure", "weight", "blood_glucose", "steps")
FOLLOW_UP_KINDS = ("return_visit", "post_visit_check_in", "other")


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FollowUp(Base):
    """ "Your doctor wanted you back in 2 weeks", in the person's own words."""

    __tablename__ = "follow_ups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("care_profiles.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(EncryptedJSON, nullable=False)
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    done_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class HealthTarget(Base):
    __tablename__ = "health_targets"
    __table_args__ = (UniqueConstraint("user_id", "profile_id", "kind", name="uq_target_kind"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("care_profiles.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    # Verbatim, never parsed. Can be blank when someone only wants the reminder.
    target_text: Mapped[str | None] = mapped_column(EncryptedJSON, nullable=True)
    remind_every_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class HealthReading(Base):
    __tablename__ = "health_readings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("care_profiles.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # {"systolic": 128, "diastolic": 82} for blood pressure; {"value": 71.5,
    # "unit": "kg"} otherwise. Encrypted.
    value: Mapped[dict] = mapped_column(EncryptedJSON, nullable=False)
    taken_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
