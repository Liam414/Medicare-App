from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class CareProfileCreate(BaseModel):
    """⛔ A name the caregiver chooses and nothing else. See the model note."""

    display_name: str = Field(..., min_length=1, max_length=40)

    @field_validator("display_name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Give this person a name you'll recognise.")
        return stripped


class CareProfileOut(BaseModel):
    id: str
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
