"""Daily check-ins: stored, shown back, and a "worse" can only raise the next estimate."""

from datetime import date, timedelta

from sqlalchemy import text

TODAY = date.today().isoformat()


def _check_in(client, headers, feeling, day=TODAY, note=None, profile=""):
    query = f"?profile_id={profile}" if profile else ""
    return client.post(f"/check-ins{query}", json={"day": day, "feeling": feeling, "note": note}, headers=headers)


def test_one_per_day_and_answering_again_replaces_it(client, auth_headers):
    _check_in(client, auth_headers, "same")
    _check_in(client, auth_headers, "better", note="synthetic note")
    body = client.get("/check-ins", headers=auth_headers).json()
    assert [(c["feeling"], c["note"]) for c in body] == [("better", "synthetic note")]


def test_worse_suggests_a_new_symptom_check(client, auth_headers):
    assert _check_in(client, auth_headers, "worse").json()["suggest_symptom_check"] is True
    assert _check_in(client, auth_headers, "better").json()["suggest_symptom_check"] is False


def test_only_three_feelings_and_never_a_future_day(client, auth_headers):
    assert _check_in(client, auth_headers, "terrible").status_code == 422
    later = (date.today() + timedelta(days=3)).isoformat()
    assert _check_in(client, auth_headers, "same", day=later).status_code == 422


def test_the_note_is_encrypted_at_rest(client, auth_headers, db_session):
    _check_in(client, auth_headers, "same", note="synthetic private note")
    assert "synthetic" not in db_session.execute(text("SELECT note FROM check_ins")).scalar()


def test_the_list_is_newest_first_and_bounded(client, auth_headers):
    for offset, feeling in ((0, "same"), (1, "worse"), (40, "better")):
        _check_in(client, auth_headers, feeling, day=(date.today() - timedelta(days=offset)).isoformat())
    body = client.get("/check-ins?days=30", headers=auth_headers).json()
    assert [c["feeling"] for c in body] == ["same", "worse"]


def test_people_are_kept_apart(client, auth_headers, other_user_headers):
    dad = client.post("/profiles", json={"display_name": "Dad"}, headers=auth_headers).json()["id"]
    _check_in(client, auth_headers, "worse", profile=dad)
    assert client.get("/check-ins", headers=auth_headers).json() == []
    assert len(client.get(f"/check-ins?profile_id={dad}", headers=auth_headers).json()) == 1
    assert client.get("/check-ins", headers=other_user_headers).json() == []
    assert client.get(f"/check-ins?profile_id={dad}", headers=other_user_headers).status_code == 404


def test_a_recent_worse_raises_a_self_care_estimate(client, auth_headers, monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    assess = lambda: client.post(  # noqa: E731
        "/intake/assess", json={"description": "I have a cold", "consent_to_store": False}, headers=auth_headers
    ).json()

    assert assess()["tier"] == "SELF_CARE"
    _check_in(client, auth_headers, "worse")
    body = assess()
    assert body["tier"] == "CLINICIAN_SOON"
    assert "feeling worse" in body["reasoning"]


def test_an_old_worse_does_not(client, auth_headers, monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    _check_in(client, auth_headers, "worse", day=(date.today() - timedelta(days=5)).isoformat())
    body = client.post(
        "/intake/assess", json={"description": "I have a cold", "consent_to_store": False}, headers=auth_headers
    ).json()
    assert body["tier"] == "SELF_CARE"
