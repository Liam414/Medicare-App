import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON
from app.db.base import Base


class HealthProfile(Base):
    """
    Conditions and allergies, as the person wrote them. One row per person:
    the account holder (`profile_id` NULL) or one of their care profiles.

    ⛔ Free text, stored verbatim, never checked against a vocabulary — the
    same rule as the emergency card. A picker of conditions would make MedHelp
    the author of a clinical vocabulary.

    ⛔ An empty list means "nothing recorded", never "none". Every surface says
    "Not recorded" rather than "None", because a blank allergy line read as
    "no allergies" is the dangerous misreading.

    Encrypted at rest (`EncryptedJSON`). Medications and visits already have
    their own tables and are read from there, not copied here.
    """

    __tablename__ = "health_profiles"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("care_profiles.id"), nullable=True, index=True
    )
    conditions: Mapped[list[str]] = mapped_column(EncryptedJSON, nullable=False, default=list)
    allergies: Mapped[list[str]] = mapped_column(EncryptedJSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
