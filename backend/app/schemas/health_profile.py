from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_ENTRIES = 30
MAX_ENTRY_CHARS = 200


class HealthProfileIn(BaseModel):
    """
    Each entry is the person's own words. Blank entries are dropped; nothing
    else is changed — no spelling fixes, no matching to a known condition.
    """

    conditions: list[str] = Field(default_factory=list, max_length=MAX_ENTRIES)
    allergies: list[str] = Field(default_factory=list, max_length=MAX_ENTRIES)

    @field_validator("conditions", "allergies")
    @classmethod
    def _entries(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if any(len(value) > MAX_ENTRY_CHARS for value in cleaned):
            raise ValueError(f"Keep each entry under {MAX_ENTRY_CHARS} characters.")
        return cleaned


class HealthProfileOut(BaseModel):
    conditions: list[str]
    allergies: list[str]
    # None until something has been saved, so a client can tell "never filled
    # in" from "filled in and emptied" if it ever needs to. Both render as
    # "Not recorded".
    updated_at: datetime | None = None
