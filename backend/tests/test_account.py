"""Account export and deletion. Synthetic data only."""

from sqlalchemy import text

from app.api import account
from app.db.base import Base
from app.models.goal import GoalActivity, GoalCompletion, HealthGoal

PASSWORD = "synthetic-password-1"  # what conftest._register signs up with


def _fill(client, headers):
    client.put("/health-profile", json={"conditions": ["c"], "allergies": ["a"]}, headers=headers)
    client.post("/medications", json={"name": "Synthetic med"}, headers=headers)
    client.post("/profiles", json={"display_name": "Dad"}, headers=headers)


def test_every_user_table_is_exported_and_deleted():
    """A new table holding user rows must be added to `account._OWNED`."""
    covered = {m.__tablename__ for m in account._OWNED} | {
        HealthGoal.__tablename__,
        GoalActivity.__tablename__,
        GoalCompletion.__tablename__,
        "users",
    }
    holding_user_rows = {
        table.name for table in Base.metadata.sorted_tables if "user_id" in table.c
    }
    assert holding_user_rows <= covered, holding_user_rows - covered


def test_export_holds_the_callers_data_and_nobody_elses(client, auth_headers, other_user_headers):
    _fill(client, auth_headers)
    client.post("/medications", json={"name": "Other persons med"}, headers=other_user_headers)

    body = client.get("/account/export", headers=auth_headers).json()

    assert body["account"]["email"] == "list.owner@example.com"
    assert "hashed_password" not in body["account"]
    assert body["health_profiles"][0]["allergies"] == ["a"]  # decrypted for its owner
    assert [m["name"] for m in body["medications"]] == ["Synthetic med"]
    assert len(body["care_profiles"]) == 1


def test_delete_needs_the_password(client, auth_headers):
    response = client.request(
        "DELETE", "/account", json={"password": "wrong-password"}, headers=auth_headers
    )
    assert response.status_code == 403
    assert client.get("/account/export", headers=auth_headers).status_code == 200


def test_delete_removes_every_row_and_the_account(client, auth_headers, other_user_headers, db_session):
    _fill(client, auth_headers)
    _fill(client, other_user_headers)

    response = client.request("DELETE", "/account", json={"password": PASSWORD}, headers=auth_headers)

    assert response.status_code == 204
    assert client.get("/account/export", headers=auth_headers).status_code == 401
    for table in ("health_profiles", "medications", "care_profiles", "users"):
        remaining = db_session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        assert remaining == 1, table  # the other account's row survives
