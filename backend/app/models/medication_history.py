"""
Medication history (owner decision 4, approved 2026-09-22).

⛔ `MedicationDose` records only what the person tapped. A time with no row is
"not marked" — never "missed". MedHelp has no idea whether a dose was taken,
and a gap in someone's taps is not evidence that they skipped anything.

`MedicationChange` is written by the API whenever a tracked field changes, so
the history of a dose or directions change is kept without anyone having to
remember to log it. Its values are names, doses and directions, so they are
encrypted at rest.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON
from app.db.base import Base

DOSE_STATUSES = ("taken", "skipped")


class MedicationDose(Base):
    __tablename__ = "medication_doses"
    __table_args__ = (
        UniqueConstraint("medication_id", "taken_on", "time_of_day", name="uq_dose_slot"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    medication_id: Mapped[str] = mapped_column(
        String, ForeignKey("medications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # A local calendar day and a local wall-clock "HH:MM" (or none, for a dose
    # recorded without a reminder time) — never a UTC instant, the same rule
    # as reminders.
    taken_on: Mapped[date] = mapped_column(Date, nullable=False)
    time_of_day: Mapped[str] = mapped_column(String(5), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class MedicationChange(Base):
    __tablename__ = "medication_changes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    medication_id: Mapped[str] = mapped_column(
        String, ForeignKey("medications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # {"dosage": ["10 mg", "20 mg"], ...} — before and after, verbatim.
    changes: Mapped[dict] = mapped_column(EncryptedJSON, nullable=False)
