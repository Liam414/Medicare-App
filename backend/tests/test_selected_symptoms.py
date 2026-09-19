"""
Picked symptom phrases are merged into the description before anything reads it.

The merge is one short function, but the separator in it is a safety property
rather than a formatting choice, and this repository has already shipped the
bug it guards against. See `merge_selected_symptoms` in app/api/intake.py.
"""

from app.api.intake import merge_selected_symptoms
from app.core.emergency import screen_for_emergency
from app.core.rules_triage import classify


def test_nothing_selected_leaves_the_description_alone():
    assert merge_selected_symptoms("my throat is sore", None) == "my throat is sore"
    assert merge_selected_symptoms("my throat is sore", []) == "my throat is sore"


def test_phrases_are_separated_so_word_boundary_matching_still_works():
    """
    ⛔ THE REASON THIS FEATURE IS ALLOWED TO BUILD A LIST AT ALL.

    Every phrase in emergency.py and rules_triage.py is compiled with word
    boundaries, so two run together match nothing. A pasted list arriving as
    "Chest painShortness of breath" was screened as neither and fell to the
    URGENT default instead of EMERGENT — a real bug, in production, on a
    cardiac description. A feature whose whole job is to assemble a list must
    not be the thing that manufactures that glue.
    """
    merged = merge_selected_symptoms("it started this morning", ["chest pain", "shortness of breath"])

    assert "chest pain" in merged
    assert "shortness of breath" in merged
    assert "painshortness" not in merged.lower()
    assert "chest pain. shortness of breath" in merged


def test_a_red_flag_phrase_still_screens_after_merging():
    """The end-to-end version of the test above: the screen actually fires."""
    merged = merge_selected_symptoms(
        "I feel awful and it came on suddenly",
        ["chest pain", "pain spreading to my arm, neck or jaw"],
    )

    guidance = screen_for_emergency(merged)

    assert guidance is not None, "a picked red-flag phrase must still reach emergency screening"


def test_a_picked_phrase_can_escalate_exactly_as_typed_text_would():
    """
    A phrase the user picked carries the same weight as one they typed.

    That is the intended direction — the list exists so somebody does not have
    to think of the word themselves — and it is the same property `followup.merge`
    relies on. ⛔ It is also why the picker may never suggest across body areas:
    a suggestion that prompted for a red flag would be the app manufacturing an
    escalation rather than recording one.
    """
    typed = classify("I have chest pain and my arm hurts")
    picked = classify(
        merge_selected_symptoms("I feel awful", ["chest pain", "pain spreading to my arm, neck or jaw"])
    )

    assert picked.tier_name == typed.tier_name
    assert picked.tier_name != "SELF_CARE"


def test_blank_and_punctuation_only_phrases_contribute_nothing():
    """A stray separator would land in text the rules are about to read."""
    merged = merge_selected_symptoms("my head hurts", ["", "   ", "...", "a fever"])

    assert merged == "my head hurts. a fever"


def test_a_phrase_is_capped_rather_than_trusted():
    """
    The field is a list of short phrases. A client can post anything, but it
    could post the same thing in `description`, so the cap bounds the damage
    without pretending the input is trusted.
    """
    merged = merge_selected_symptoms("headache", ["x" * 500])

    assert len(merged) < 200


def test_the_order_the_client_sent_is_preserved():
    """
    Deterministic input for a deterministic classifier. The device sends the
    vocabulary's own order rather than tap order, so the same selection always
    produces the same description.
    """
    first = merge_selected_symptoms("base", ["a fever", "vomiting"])
    second = merge_selected_symptoms("base", ["a fever", "vomiting"])

    assert first == second == "base. a fever. vomiting"
