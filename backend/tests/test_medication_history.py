"""Medication history: taps, start/stop, changes. Synthetic data only."""

from datetime import date, timedelta

from sqlalchemy import text

MED = {"name": "Synthetimol", "dosage": "10 mg", "frequency": "TAKE 1 TABLET DAILY"}


def _med(client, headers, **extra):
    return client.post("/medications", json={**MED, **extra}, headers=headers).json()["id"]


def test_a_tap_is_recorded_and_re_tapping_replaces_it(client, auth_headers):
    med = _med(client, auth_headers)
    today = date.today().isoformat()

    client.post(f"/medications/{med}/doses", json={"taken_on": today, "time_of_day": "08:00", "status": "taken"}, headers=auth_headers)
    client.post(f"/medications/{med}/doses", json={"taken_on": today, "time_of_day": "08:00", "status": "skipped"}, headers=auth_headers)

    doses = client.get(f"/medications/{med}/history", headers=auth_headers).json()["doses"]
    assert [(d["time_of_day"], d["status"]) for d in doses] == [("08:00", "skipped")]


def test_an_untapped_time_has_no_row_and_nothing_says_missed(client, auth_headers):
    med = _med(client, auth_headers)
    body = client.get(f"/medications/{med}/history", headers=auth_headers)
    assert body.json()["doses"] == []
    assert "missed" not in body.text.lower()


def test_only_taken_or_skipped_and_never_a_future_day(client, auth_headers):
    med = _med(client, auth_headers)
    later = (date.today() + timedelta(days=5)).isoformat()
    assert client.post(f"/medications/{med}/doses", json={"taken_on": date.today().isoformat(), "status": "missed"}, headers=auth_headers).status_code == 422
    assert client.post(f"/medications/{med}/doses", json={"taken_on": later, "status": "taken"}, headers=auth_headers).status_code == 422
    assert client.post(f"/medications/{med}/doses", json={"taken_on": date.today().isoformat(), "time_of_day": "8am", "status": "taken"}, headers=auth_headers).status_code == 422


def test_a_tap_can_be_undone(client, auth_headers):
    med = _med(client, auth_headers)
    dose = client.post(f"/medications/{med}/doses", json={"taken_on": date.today().isoformat(), "status": "taken"}, headers=auth_headers).json()
    assert client.delete(f"/medications/{med}/doses/{dose['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"/medications/{med}/history", headers=auth_headers).json()["doses"] == []


def test_changes_are_recorded_verbatim_and_encrypted(client, auth_headers, db_session):
    med = _med(client, auth_headers)
    client.put(f"/medications/{med}", json={**MED, "dosage": "20 mg", "started_on": "2026-01-02"}, headers=auth_headers)

    changes = client.get(f"/medications/{med}/history", headers=auth_headers).json()["changes"]
    assert changes[0]["changes"] == {"dosage": ["10 mg", "20 mg"], "started_on": [None, "2026-01-02"]}
    raw = db_session.execute(text("SELECT changes FROM medication_changes")).scalar()
    assert "20 mg" not in raw


def test_saving_without_changes_records_nothing(client, auth_headers):
    med = _med(client, auth_headers)
    client.put(f"/medications/{med}", json=MED, headers=auth_headers)
    assert client.get(f"/medications/{med}/history", headers=auth_headers).json()["changes"] == []


def test_stop_before_start_is_refused(client, auth_headers):
    response = client.post(
        "/medications", json={**MED, "started_on": "2026-02-01", "stopped_on": "2026-01-01"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_a_stopped_medication_arms_no_reminders(client, auth_headers):
    med = _med(client, auth_headers)
    client.put(f"/reminders/medications/{med}", json={"times": ["08:00"]}, headers=auth_headers)
    assert [s["medication_id"] for s in client.get("/reminders", headers=auth_headers).json()] == [med]

    client.put(f"/medications/{med}", json={**MED, "stopped_on": date.today().isoformat()}, headers=auth_headers)
    assert client.get("/reminders", headers=auth_headers).json() == []


def test_someone_elses_medication_history_is_404(client, auth_headers, other_user_headers):
    med = _med(client, auth_headers)
    assert client.get(f"/medications/{med}/history", headers=other_user_headers).status_code == 404
    assert client.post(
        f"/medications/{med}/doses", json={"taken_on": date.today().isoformat(), "status": "taken"}, headers=other_user_headers
    ).status_code == 404


def test_deleting_a_medication_deletes_its_history(client, auth_headers, db_session):
    med = _med(client, auth_headers)
    client.post(f"/medications/{med}/doses", json={"taken_on": date.today().isoformat(), "status": "taken"}, headers=auth_headers)
    client.put(f"/medications/{med}", json={**MED, "dosage": "5 mg"}, headers=auth_headers)

    client.delete(f"/medications/{med}", headers=auth_headers)

    for table in ("medication_doses", "medication_changes"):
        assert db_session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() == 0
