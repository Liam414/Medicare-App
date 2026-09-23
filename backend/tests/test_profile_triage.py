"""The health profile may only ever raise an urgency estimate. Synthetic data only."""

import itertools

import pytest

from app.core import followup
from app.core.profile_triage import ProfileContext, apply, names_an_allergen
from app.core.triage import Tier, assess

PEANUT = ProfileContext(allergies=("Peanuts",))
CONDITION = ProfileContext(conditions=("synthetic long-term condition",))


@pytest.mark.parametrize(
    "tier,profile",
    itertools.product(
        list(Tier),
        [
            PEANUT,
            CONDITION,
            ProfileContext(allergies=("peanut",), allergy_contact="Yes"),
            ProfileContext(allergies=("peanut",), allergy_contact="I'm not sure"),
            ProfileContext(conditions=("x",), allergies=("peanut",), allergy_contact="No"),
        ],
    ),
)
def test_the_profile_never_lowers_any_tier(tier, profile):
    for text in ("ate peanuts", "a cold", "chest pain"):
        raised, _, _ = apply(tier, text, profile)
        assert raised >= tier


def test_no_profile_changes_nothing():
    assert apply(Tier.SELF_CARE, "ate peanuts", None) == (Tier.SELF_CARE, [], "")


def test_naming_an_allergen_on_the_list_is_at_least_urgent():
    tier, ids, note = apply(Tier.SELF_CARE, "I think I ate a peanut", PEANUT)
    assert tier is Tier.URGENT
    assert ids == ["profile:allergen_named"]
    assert "allergy list" in note


def test_matching_is_whole_word_and_ignores_filler():
    assert names_an_allergen("some peanuts in a cookie", ("peanut",))
    assert not names_an_allergen("I have a cold", ("allergy to cats",))
    assert not names_an_allergen("peanutbutterish", ("peanut",))


def test_contact_answers_raise_and_unsure_goes_higher_not_lower():
    assert apply(Tier.SELF_CARE, "a rash", ProfileContext(allergies=("x",), allergy_contact="Yes"))[0] is Tier.URGENT
    assert (
        apply(Tier.SELF_CARE, "a rash", ProfileContext(allergies=("x",), allergy_contact="I'm not sure"))[0]
        is Tier.CLINICIAN_SOON
    )
    assert apply(Tier.SELF_CARE, "a rash", ProfileContext(allergies=("x",), allergy_contact="No"))[0] is Tier.SELF_CARE


def test_a_recorded_condition_stops_self_care_being_earned():
    tier, ids, note = apply(Tier.SELF_CARE, "I have a cold", CONDITION)
    assert tier is Tier.CLINICIAN_SOON
    assert ids == ["profile:condition_recorded"]
    assert "long-term condition" in note


def test_nothing_is_explained_when_nothing_was_raised():
    assert apply(Tier.URGENT, "I have a cold", CONDITION) == (Tier.URGENT, [], "")


def test_assess_applies_the_profile_after_everything_else(monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    result = assess("I have a cold", profile=CONDITION)
    assert result.tier is Tier.CLINICIAN_SOON
    assert result.rule_tier is Tier.SELF_CARE
    assert "profile:condition_recorded" in result.rule_ids


def test_the_allergy_question_is_round_one_only_when_allergies_exist():
    ids = [q.question_id for q in followup.questions_for_round(1, has_allergies=True)]
    assert "allergy_contact" in ids
    assert "allergy_contact" not in [q.question_id for q in followup.questions_for_round(1)]
    # Never a round-two id, so it cannot spend a round.
    assert followup.rounds_completed({"allergy_contact": "Yes"}) == 1


def test_the_allergy_answer_is_not_merged_into_the_description():
    assert followup.merge("a rash", {"allergy_contact": "Yes"}) == "a rash"


# --- Through the API -------------------------------------------------------


def _assess(client, headers, text, **extra):
    return client.post(
        "/intake/assess",
        json={"description": text, "consent_to_store": True, **extra},
        headers=headers,
    )


def test_intake_reads_the_callers_profile(client, auth_headers, monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    client.put("/health-profile", json={"conditions": [], "allergies": ["peanuts"]}, headers=auth_headers)

    body = _assess(client, auth_headers, "I have a cold and I think I ate peanuts").json()

    assert body["tier"] == "URGENT"
    assert "allergy list" in body["reasoning"]


def test_a_care_profiles_allergies_are_not_applied_to_the_account_holder(client, auth_headers, monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    dad = client.post("/profiles", json={"display_name": "Dad"}, headers=auth_headers).json()["id"]
    client.put(f"/health-profile?profile_id={dad}", json={"conditions": ["x"], "allergies": []}, headers=auth_headers)

    assert _assess(client, auth_headers, "I have a cold").json()["tier"] == "SELF_CARE"
    assert _assess(client, auth_headers, "I have a cold", profile_id=dad).json()["tier"] == "CLINICIAN_SOON"


def test_a_foreign_profile_id_never_blocks_screening(client, auth_headers, monkeypatch):
    from app.core import triage

    monkeypatch.setattr(triage, "credentials_available", lambda: False)
    response = _assess(client, auth_headers, "crushing chest pain", profile_id="not-mine")
    assert response.status_code == 201
    assert response.json()["tier"] == "EMERGENT"
