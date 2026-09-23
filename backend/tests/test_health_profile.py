"""Health profile: stored verbatim, encrypted at rest, scoped to its owner. Synthetic data only."""

import pytest
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text

from app.core import crypto

PROFILE = {"conditions": ["  Synthetic condition A ", "", "condition b as typed"], "allergies": ["Synthetic allergen"]}


def test_a_new_account_has_nothing_recorded(client, auth_headers):
    body = client.get("/health-profile", headers=auth_headers).json()
    assert body == {"conditions": [], "allergies": [], "updated_at": None}


def test_entries_round_trip_verbatim_with_blanks_dropped(client, auth_headers):
    saved = client.put("/health-profile", json=PROFILE, headers=auth_headers)
    assert saved.status_code == 200

    body = client.get("/health-profile", headers=auth_headers).json()
    assert body["conditions"] == ["Synthetic condition A", "condition b as typed"]
    assert body["allergies"] == ["Synthetic allergen"]
    assert body["updated_at"] is not None


def test_saving_again_replaces_rather_than_duplicating(client, auth_headers, db_session):
    client.put("/health-profile", json=PROFILE, headers=auth_headers)
    client.put("/health-profile", json={"conditions": [], "allergies": ["other"]}, headers=auth_headers)

    assert db_session.execute(text("SELECT COUNT(*) FROM health_profiles")).scalar() == 1
    assert client.get("/health-profile", headers=auth_headers).json()["allergies"] == ["other"]


def test_the_database_holds_ciphertext_not_the_words(client, auth_headers, db_session):
    client.put("/health-profile", json=PROFILE, headers=auth_headers)

    raw = db_session.execute(text("SELECT conditions, allergies FROM health_profiles")).one()
    assert "Synthetic" not in raw.conditions
    assert "Synthetic" not in raw.allergies


def test_a_value_under_another_key_raises_rather_than_reading_as_empty(monkeypatch):
    sealed = crypto.EncryptedJSON().process_bind_param(["Synthetic allergen"], None)

    other = Fernet(Fernet.generate_key())
    monkeypatch.setattr(crypto, "fernet", lambda: other)

    with pytest.raises(InvalidToken):
        crypto.EncryptedJSON().process_result_value(sealed, None)


def test_an_over_long_entry_is_refused(client, auth_headers):
    response = client.put(
        "/health-profile", json={"conditions": ["x" * 201], "allergies": []}, headers=auth_headers
    )
    assert response.status_code == 422


def test_another_account_cannot_read_it(client, auth_headers, other_user_headers):
    client.put("/health-profile", json=PROFILE, headers=auth_headers)
    assert client.get("/health-profile", headers=other_user_headers).json()["allergies"] == []


def test_care_profiles_are_kept_apart_and_a_foreign_one_is_404(client, auth_headers, other_user_headers):
    dad = client.post("/profiles", json={"display_name": "Dad"}, headers=auth_headers).json()["id"]
    client.put(f"/health-profile?profile_id={dad}", json=PROFILE, headers=auth_headers)

    assert client.get("/health-profile", headers=auth_headers).json()["allergies"] == []
    assert client.get(f"/health-profile?profile_id={dad}", headers=auth_headers).json()["allergies"] == [
        "Synthetic allergen"
    ]
    assert client.get(f"/health-profile?profile_id={dad}", headers=other_user_headers).status_code == 404


def test_deleting_a_care_profile_deletes_its_health_profile(client, auth_headers, db_session):
    dad = client.post("/profiles", json={"display_name": "Dad"}, headers=auth_headers).json()["id"]
    client.put(f"/health-profile?profile_id={dad}", json=PROFILE, headers=auth_headers)

    client.delete(f"/profiles/{dad}", headers=auth_headers)

    assert db_session.execute(text("SELECT COUNT(*) FROM health_profiles")).scalar() == 0
