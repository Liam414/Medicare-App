import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CareProfile(Base):
    """
    Somebody else whose medications, symptoms and appointments the account
    holder manages — a parent, a child, a partner.

    ⛔ A display name and nothing else. No date of birth, age, sex or
    relationship: each is more data about a person who never signed up, and an
    age in particular would invite being fed to triage, which is fenced. The
    name is whatever the caregiver chooses to call them ("Mum", "Sam") and is
    shown back, never interpreted.

    Rows elsewhere point here through a nullable `profile_id`. NULL means the
    account holder themselves, so every row written before profiles existed is
    still theirs and still where it was.
    """

    __tablename__ = "care_profiles"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
