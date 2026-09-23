"""
GET /intake and DELETE /intake/{id}: a person reading back, and removing, the
assessments they consented to store. All descriptions synthetic.
"""

import pytest

from app.core.triage import Tier, TriageResult
from app.models.intake import IntakeAssessment


@pytest.fixture()
def stub_triage(monkeypatch):
    def _fake(description: str, *, followup_already_asked: bool = False):
        return TriageResult(
            tier=Tier.URGENT,
            reasoning="Synthetic reasoning.",
            red_flag_match=False,
            emergency=None,
            model_tier=Tier.URGENT,
            model_id="synthetic",
            escalated_by_safety_net=False,
            rule_tier=Tier.URGENT,
            # Recognised, so the API assesses rather than asking questions.
            rules_defaulted=False,
        )

    monkeypatch.setattr("app.api.intake.assess", _fake)

    async def _no_topics(term: str, *, limit: int = 10):
        return []

    monkeypatch.setattr("app.api.intake.search_topics", _no_topics)


def _assess(client, headers, text, consent=True, answers=None):
    body = {"description": text, "consent_to_store": consent}
    if answers:
        body["follow_up_answers"] = answers
    return client.post("/intake/assess", json=body, headers=headers).json()


def test_history_requires_a_token(client):
    assert client.get("/intake").status_code == 401


def test_history_reads_back_exactly_what_was_stored_newest_first(
    client, auth_headers, stub_triage
):
    _assess(client, auth_headers, "synthetic first description")
    _assess(client, auth_headers, "synthetic second description")

    rows = client.get("/intake", headers=auth_headers).json()

    assert [r["description"] for r in rows] == [
        "synthetic second description",
        "synthetic first description",
    ]
    assert rows[0]["tier"] == "URGENT"
    assert rows[0]["reasoning"] == "Synthetic reasoning."


def test_an_unconsented_assessment_is_never_listed(client, auth_headers, stub_triage):
    _assess(client, auth_headers, "synthetic unconsented description", consent=False)

    assert client.get("/intake", headers=auth_headers).json() == []


def test_history_carries_no_audit_fields(client, auth_headers, stub_triage):
    # Rule ids, the model's separate tier and its confidence are for a
    # reviewer, not a receipt. Showing them would invite reading a
    # disagreement between layers as a second opinion.
    _assess(client, auth_headers, "synthetic description")

    row = client.get("/intake", headers=auth_headers).json()[0]

    assert set(row) == {"id", "created_at", "tier", "reasoning", "description", "summary"}


def test_a_second_user_sees_none_of_the_first_users_history(
    client, auth_headers, other_user_headers, stub_triage
):
    _assess(client, auth_headers, "synthetic private description")

    assert client.get("/intake", headers=other_user_headers).json() == []


def test_the_recap_is_rebuilt_from_the_stored_answers(client, auth_headers, stub_triage):
    _assess(
        client, auth_headers, "synthetic ache", answers={"location": "synthetic left knee"}
    )

    summary = client.get("/intake", headers=auth_headers).json()[0]["summary"]

    assert {"label": "Where", "value": "synthetic left knee"} in summary["understood"]


def test_delete_removes_the_row_from_the_table(client, auth_headers, stub_triage, db_session):
    assessment_id = _assess(client, auth_headers, "synthetic description")["id"]

    assert client.delete(f"/intake/{assessment_id}", headers=auth_headers).status_code == 204
    assert db_session.query(IntakeAssessment).filter_by(id=assessment_id).count() == 0


def test_another_users_assessment_cannot_be_deleted_and_is_not_confirmed(
    client, auth_headers, other_user_headers, stub_triage, db_session
):
    assessment_id = _assess(client, auth_headers, "synthetic description")["id"]

    response = client.delete(f"/intake/{assessment_id}", headers=other_user_headers)

    assert response.status_code == 404
    assert db_session.query(IntakeAssessment).filter_by(id=assessment_id).count() == 1
