"""
Care profiles: the people an account holder manages health records for.

⛔ Two rules hold throughout, the same two every other module here holds:

* Every query filters on the authenticated user. Someone else's profile id is
  a 404, never a 403, so the endpoint cannot confirm that a profile exists.
* Nothing here logs a display name.

`owned_profile_id` is the single place a `profile_id` from a request is
checked. Every endpoint that accepts one calls it, so there is no path by which
a row can be written under — or read from — a profile the caller does not own.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.appointment import Appointment
from app.models.care_profile import CareProfile
from app.models.health_profile import HealthProfile
from app.models.intake import IntakeAssessment
from app.models.medication import Medication
from app.models.reminder import MedicationReminder
from app.models.user import User
from app.schemas.profile import CareProfileCreate, CareProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])

# Enough for a household. A cap stops a script filling a table with names of
# people who never agreed to be in it.
MAX_PROFILES = 10


def owned_profile_id(profile_id: str | None, user: User, db: Session) -> str | None:
    """
    The profile id to scope to, or None for the account holder themselves.

    Raises 404 for an id the caller does not own. An empty string is treated
    as "me", so a client can send the field unconditionally.
    """
    if not profile_id:
        return None
    exists = (
        db.query(CareProfile.id)
        .filter(CareProfile.id == profile_id, CareProfile.user_id == user.id)
        .first()
    )
    if exists is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return profile_id


def profile_filter(column, profile_id: str | None):
    """`WHERE profile_id IS NULL` for the account holder, `= id` otherwise."""
    return column.is_(None) if profile_id is None else column == profile_id


@router.get("", response_model=list[CareProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CareProfile]:
    return (
        db.query(CareProfile)
        .filter(CareProfile.user_id == user.id)
        .order_by(CareProfile.created_at)
        .all()
    )


@router.post("", response_model=CareProfileOut, status_code=status.HTTP_201_CREATED)
def create_profile(
    payload: CareProfileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CareProfile:
    count = db.query(CareProfile).filter(CareProfile.user_id == user.id).count()
    if count >= MAX_PROFILES:
        raise HTTPException(
            status_code=400,
            detail=f"MedHelp can hold up to {MAX_PROFILES} people besides you.",
        )
    profile = CareProfile(user_id=user.id, display_name=payload.display_name)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """
    Remove a profile and everything recorded under it.

    ⛔ Everything, explicitly, and in this order. SQLite does not enforce the
    cascade, and a leftover reminder is not untidy data — it is an alarm telling
    someone to give a person a medicine they may have stopped, the same reason
    deleting a medication deletes its reminders.
    """
    owned_profile_id(profile_id, user, db)

    medication_ids = [
        row.id
        for row in db.query(Medication.id).filter(
            Medication.user_id == user.id, Medication.profile_id == profile_id
        )
    ]
    if medication_ids:
        db.query(MedicationReminder).filter(
            MedicationReminder.medication_id.in_(medication_ids)
        ).delete(synchronize_session=False)
    for model in (Medication, IntakeAssessment, Appointment, HealthProfile):
        db.query(model).filter(
            model.user_id == user.id, model.profile_id == profile_id
        ).delete(synchronize_session=False)
    db.query(CareProfile).filter(
        CareProfile.id == profile_id, CareProfile.user_id == user.id
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
