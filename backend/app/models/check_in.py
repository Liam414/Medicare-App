"""
"How are you feeling today?" — better, same or worse, and an optional note.

One row per person per local day; answering again that day replaces it.
The note is the person's own words and is encrypted at rest.

⛔ Stored and shown back, never interpreted: no score, no streak, no "you are
improving". The trend view draws the person's own answers and nothing else.
The one thing a check-in does is this: a "worse" from today or yesterday
means the next symptom check cannot come back lower than CLINICIAN_SOON
(`profile_triage`). It can only raise.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON
from app.db.base import Base

FEELINGS = ("better", "same", "worse")


class CheckIn(Base):
    __tablename__ = "check_ins"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("care_profiles.id"), nullable=True, index=True
    )
    # The person's local calendar day, sent by the client — never UTC.
    day: Mapped[date] = mapped_column(Date, nullable=False)
    feeling: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(EncryptedJSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
