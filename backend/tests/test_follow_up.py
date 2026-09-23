"""Follow-ups, readings and the person's own targets. Synthetic data only."""

from datetime import date, timedelta

from sqlalchemy import text

TODAY = date.today()


def _days(n: int) -> str:
    return (TODAY + timedelta(days=n)).isoformat()


# --- Follow-ups --------------------------------------------------------------


def test_follow_ups_list_open_by_due_date_then_recently_done(client, auth_headers):
    later = client.post("/follow-ups", json={"kind": "return_visit", "title": "Back to Dr Synthetic", "due_on": _days(14)}, headers=auth_headers).json()
    sooner = client.post("/follow-ups", json={"kind": "post_visit_check_in", "title": "How did the visit go?", "due_on": _days(1)}, headers=auth_headers).json()
    done = client.post("/follow-ups", json={"kind": "other", "title": "Book blood test", "due_on": _days(3)}, headers=auth_headers).json()
    client.patch(f"/follow-ups/{done['id']}", json={"done": True}, headers=auth_headers)

    body = client.get("/follow-ups", headers=auth_headers).json()
    assert [f["id"] for f in body] == [sooner["id"], later["id"], done["id"]]
    assert body[2]["done_on"] == TODAY.isoformat()


def test_follow_up_titles_are_encrypted_and_scoped(client, auth_headers, other_user_headers, db_session):
    row = client.post("/follow-ups", json={"kind": "other", "title": "Synthetic secret title", "due_on": _days(2)}, headers=auth_headers).json()
    assert "Synthetic" not in db_session.execute(text("SELECT title FROM follow_ups")).scalar()
    assert client.get("/follow-ups", headers=other_user_headers).json() == []
    assert client.patch(f"/follow-ups/{row['id']}", json={"done": True}, headers=other_user_headers).status_code == 404
    assert client.delete(f"/follow-ups/{row['id']}", headers=other_user_headers).status_code == 404


# --- Readings ----------------------------------------------------------------


def _reading(client, headers, **body):
    return client.post("/readings", json={"taken_on": TODAY.isoformat(), **body}, headers=headers)


def test_readings_are_stored_as_entered_and_encrypted(client, auth_headers, db_session):
    assert _reading(client, auth_headers, kind="blood_pressure", systolic=128, diastolic=82).status_code == 201
    assert _reading(client, auth_headers, kind="weight", value=71.5, unit="kg").status_code == 201

    body = client.get("/readings", headers=auth_headers).json()
    values = [r["value"] for r in body["readings"]]
    assert {"systolic": 128, "diastolic": 82, "unit": "mmHg"} in values
    assert {"value": 71.5, "unit": "kg"} in values
    assert "128" not in db_session.execute(text("SELECT value FROM health_readings WHERE kind='blood_pressure'")).scalar()


def test_mistyped_or_malformed_readings_are_refused(client, auth_headers):
    assert _reading(client, auth_headers, kind="blood_pressure", systolic=1280, diastolic=82).status_code == 422
    assert _reading(client, auth_headers, kind="blood_pressure", systolic=128).status_code == 422
    assert _reading(client, auth_headers, kind="weight", value=70, unit="stone").status_code == 422
    assert _reading(client, auth_headers, kind="mood", value=3, unit="x").status_code == 422
    assert client.post("/readings", json={"kind": "steps", "value": 10, "unit": "steps", "taken_on": _days(5)}, headers=auth_headers).status_code == 422


def test_a_target_is_verbatim_and_a_reading_is_due_after_the_interval(client, auth_headers):
    summaries = client.put(
        "/readings/targets/blood_pressure",
        json={"target_text": "130/80, from Dr Synthetic", "remind_every_days": 3},
        headers=auth_headers,
    ).json()
    assert summaries == [
        {
            "kind": "blood_pressure",
            "target_text": "130/80, from Dr Synthetic",
            "remind_every_days": 3,
            "last_taken_on": None,
            "due": True,
            "days_since": None,
        }
    ]

    client.post("/readings", json={"kind": "blood_pressure", "systolic": 150, "diastolic": 95, "taken_on": _days(-1)}, headers=auth_headers)
    summary = client.get("/readings", headers=auth_headers).json()["summaries"][0]
    assert (summary["due"], summary["days_since"]) == (False, 1)


def test_nothing_judges_a_reading_against_its_target(client, auth_headers):
    client.put("/readings/targets/blood_pressure", json={"target_text": "130/80"}, headers=auth_headers)
    _reading(client, auth_headers, kind="blood_pressure", systolic=190, diastolic=120)
    body = client.get("/readings", headers=auth_headers).text.lower()
    for word in ("high", "low", "above", "below", "normal", "risk", "good", "bad"):
        assert word not in body


def test_clearing_both_fields_removes_the_target(client, auth_headers):
    client.put("/readings/targets/steps", json={"target_text": "8000", "remind_every_days": 1}, headers=auth_headers)
    assert client.put("/readings/targets/steps", json={}, headers=auth_headers).json() == []


def test_readings_are_scoped_per_person(client, auth_headers, other_user_headers):
    dad = client.post("/profiles", json={"display_name": "Dad"}, headers=auth_headers).json()["id"]
    client.post(f"/readings?profile_id={dad}", json={"kind": "steps", "value": 4000, "unit": "steps", "taken_on": TODAY.isoformat()}, headers=auth_headers)
    assert client.get("/readings", headers=auth_headers).json()["readings"] == []
    assert len(client.get(f"/readings?profile_id={dad}", headers=auth_headers).json()["readings"]) == 1
    assert client.get(f"/readings?profile_id={dad}", headers=other_user_headers).status_code == 404
