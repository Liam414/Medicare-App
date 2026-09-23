"""
Care profiles: records kept for somebody else. Synthetic names and data only.
"""

import pytest

from app.core.triage import Tier, TriageResult
from app.models.appointment import Appointment
from app.models.care_profile import CareProfile
from app.models.intake import IntakeAssessment
from app.models.medication import Medication
from app.models.reminder import MedicationReminder

APPOINTMENT = {
    "provider_name": "Synthetic Clinic",
    "provider_npi": "1000000001",
    "provider_specialty": "Clinic/Center, Urgent Care",
    "provider_phone": "(212) 555-0143",
    "provider_address": "1 Synthetic Plaza, New York, NY, 10001",
    "reason_for_visit": "synthetic reason",
    "preferred_time": "synthetic time",
}


def _profile(client, headers, name="Synthetic Parent"):
    response = client.post("/profiles", json={"display_name": name}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _medication(client, headers, profile_id=None, name="Synthetimol"):
    params = {"profile_id": profile_id} if profile_id else None
    response = client.post(
        "/medications", json={"name": name, "frequency": "synthetic"}, params=params, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture()
def stub_triage(monkeypatch):
    def _fake(description: str, *, followup_already_asked: bool = False, profile=None):
        return TriageResult(
            tier=Tier.URGENT,
            reasoning="Synthetic reasoning.",
            red_flag_match=False,
            emergency=None,
            model_tier=Tier.URGENT,
            model_id="synthetic",
            escalated_by_safety_net=False,
            rule_tier=Tier.URGENT,
            rules_defaulted=False,
        )

    monkeypatch.setattr("app.api.intake.assess", _fake)

    async def _no_topics(term: str, *, limit: int = 10):
        return []

    monkeypatch.setattr("app.api.intake.search_topics", _no_topics)


def test_a_profile_holds_a_display_name_and_nothing_else(db_session):
    # ⛔ No date of birth, age, sex or relationship: more data about someone
    # who never signed up, and an age would invite a fenced triage input.
    assert {c.name for c in CareProfile.__table__.columns} == {
        "id", "user_id", "display_name", "created_at",
    }


def test_profiles_are_listed_only_to_their_owner(client, auth_headers, other_user_headers):
    _profile(client, auth_headers)

    assert len(client.get("/profiles", headers=auth_headers).json()) == 1
    assert client.get("/profiles", headers=other_user_headers).json() == []


def test_a_blank_name_is_refused(client, auth_headers):
    response = client.post("/profiles", json={"display_name": "   "}, headers=auth_headers)
    assert response.status_code == 422


def test_medications_are_kept_apart_by_whose_they_are(client, auth_headers):
    profile_id = _profile(client, auth_headers)
    _medication(client, auth_headers, name="Synthetic Mine")
    _medication(client, auth_headers, profile_id, name="Synthetic Theirs")

    mine = client.get("/medications", headers=auth_headers).json()
    theirs = client.get("/medications", params={"profile_id": profile_id}, headers=auth_headers).json()

    assert [m["name"] for m in mine] == ["Synthetic Mine"]
    assert [m["name"] for m in theirs] == ["Synthetic Theirs"]


def test_another_users_profile_cannot_be_read_or_written_through(
    client, auth_headers, other_user_headers
):
    profile_id = _profile(client, auth_headers)

    listed = client.get("/medications", params={"profile_id": profile_id}, headers=other_user_headers)
    created = client.post(
        "/medications",
        json={"name": "Synthetic"},
        params={"profile_id": profile_id},
        headers=other_user_headers,
    )

    assert listed.status_code == 404
    assert created.status_code == 404


def test_a_reminder_says_whose_medication_it_is(client, auth_headers):
    profile_id = _profile(client, auth_headers, name="Synthetic Grandad")
    medication_id = _medication(client, auth_headers, profile_id)

    schedules = client.get("/reminders", headers=auth_headers).json()

    assert [(s["medication_id"], s["profile_name"]) for s in schedules] == [
        (medication_id, "Synthetic Grandad")
    ]


def test_intake_is_stored_under_the_profile_and_listed_there(client, auth_headers, stub_triage):
    profile_id = _profile(client, auth_headers)
    client.post(
        "/intake/assess",
        json={"description": "synthetic", "consent_to_store": True, "profile_id": profile_id},
        headers=auth_headers,
    )

    assert client.get("/intake", headers=auth_headers).json() == []
    assert len(client.get("/intake", params={"profile_id": profile_id}, headers=auth_headers).json()) == 1


def test_a_foreign_profile_id_never_withholds_an_assessment(
    client, auth_headers, other_user_headers, stub_triage, db_session
):
    # ⛔ Screening must never be refused over bookkeeping. A stale or foreign
    # profile id costs the stored row, not the answer.
    foreign = _profile(client, other_user_headers)

    response = client.post(
        "/intake/assess",
        json={"description": "synthetic", "consent_to_store": True, "profile_id": foreign},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert response.json()["tier"] == "URGENT"
    assert response.json()["id"] is None
    assert db_session.query(IntakeAssessment).count() == 0


def test_appointments_are_kept_apart_by_whose_they_are(client, auth_headers):
    profile_id = _profile(client, auth_headers)
    client.post("/appointments", json=APPOINTMENT, params={"profile_id": profile_id}, headers=auth_headers)

    assert client.get("/appointments", headers=auth_headers).json() == []
    assert len(client.get("/appointments", params={"profile_id": profile_id}, headers=auth_headers).json()) == 1


def test_deleting_a_profile_deletes_everything_under_it_and_nothing_else(
    client, auth_headers, stub_triage, db_session
):
    # SQLite does not enforce the cascade, so this asserts against the tables.
    # A leftover reminder is an alarm to give someone a medicine they may have
    # stopped.
    profile_id = _profile(client, auth_headers)
    theirs = _medication(client, auth_headers, profile_id)
    mine = _medication(client, auth_headers, name="Synthetic Mine")
    for medication_id in (theirs, mine):
        client.put(
            f"/reminders/medications/{medication_id}", json={"times": ["08:00"]}, headers=auth_headers
        )
    client.post(
        "/intake/assess",
        json={"description": "synthetic", "consent_to_store": True, "profile_id": profile_id},
        headers=auth_headers,
    )
    client.post("/appointments", json=APPOINTMENT, params={"profile_id": profile_id}, headers=auth_headers)

    assert client.delete(f"/profiles/{profile_id}", headers=auth_headers).status_code == 204

    assert db_session.query(CareProfile).count() == 0
    assert [m.id for m in db_session.query(Medication).all()] == [mine]
    assert {r.medication_id for r in db_session.query(MedicationReminder).all()} == {mine}
    assert db_session.query(IntakeAssessment).count() == 0
    assert db_session.query(Appointment).count() == 0


def test_another_users_profile_cannot_be_deleted(client, auth_headers, other_user_headers, db_session):
    profile_id = _profile(client, auth_headers)

    assert client.delete(f"/profiles/{profile_id}", headers=other_user_headers).status_code == 404
    assert db_session.query(CareProfile).count() == 1
