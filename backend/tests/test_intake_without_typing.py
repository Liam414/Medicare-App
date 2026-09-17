"""
An assessment can be asked for by tapping alone, with nothing typed.

⛔ WHAT CHANGED, AND WHY THIS FILE EXISTS.

`IntakeRequest.description` was `min_length=1` from the day the endpoint was
written, and the client refused an empty box with a matching message. The
symptom picker that shipped on 2026-09-16 kept that deliberately — its comment
read "a picked symptom is not a substitute for a description", on the reasoning
that the list was an aid to someone already writing.

The repository owner reversed it on 2026-09-17, asking that the list be usable
on its own: "you don't have to always include a description text... you can
only use that if you want to". CLAUDE.md records the reversal.

So the floor moved rather than disappearing. These tests hold the new floor:
either box is enough, neither box is still refused, and everything the merge
already guaranteed about picked phrases still holds when they are the whole
description rather than an addition to one.
"""

import pytest
from pydantic import ValidationError

from app.api.intake import merge_selected_symptoms
from app.core.emergency import screen_for_emergency
from app.core.rules_triage import classify
from app.schemas.intake import IntakeRequest


# ---------------------------------------------------------------------------
# The new floor.
# ---------------------------------------------------------------------------


def test_picked_phrases_alone_are_a_valid_submission():
    """The whole point of the change: no typed text, and it is accepted."""
    request = IntakeRequest(
        description="",
        selected_symptoms=["a sore throat", "a fever"],
    )

    assert request.description == ""
    assert request.selected_symptoms == ["a sore throat", "a fever"]


def test_typed_text_alone_is_still_a_valid_submission():
    """The old way in did not become the new way out."""
    request = IntakeRequest(description="my throat has been sore since yesterday")

    assert request.selected_symptoms is None


def test_a_description_field_left_out_entirely_is_the_same_as_empty():
    """A tap-only client has no reason to send the key at all."""
    request = IntakeRequest(selected_symptoms=["a headache"])

    assert request.description == ""


@pytest.mark.parametrize(
    "payload",
    [
        {"description": ""},
        {"description": "   "},
        {"description": "", "selected_symptoms": []},
        {"description": "\n\t "},
        {},
    ],
)
def test_saying_nothing_at_all_is_still_refused(payload):
    """
    ⛔ THE FLOOR MOVED; IT DID NOT DISAPPEAR.

    An empty submission asks the classifier to estimate urgency from nothing.
    The rule layer would answer URGENT — its safe default — and that tier would
    have no basis of any kind under it. A refusal is better than a tier nobody
    described.
    """
    with pytest.raises(ValidationError):
        IntakeRequest(**payload)


def test_the_refusal_never_quotes_what_was_submitted():
    """
    ⛔ THE MESSAGE CARRIES NO VALUE, FOR THE REASON `app/main.py` STRIPS THEM.

    Intake text is the most sensitive free text in the app, and the validation
    handler exists to keep a rejected value off the wire. A validator whose own
    message quoted the submission would defeat that from the inside.
    """
    with pytest.raises(ValidationError) as caught:
        IntakeRequest(description="  ", selected_symptoms=[])

    rendered = str(caught.value)
    assert "Describe your symptoms or pick at least one" in rendered


# ---------------------------------------------------------------------------
# What the merge does when the picked phrases ARE the description.
# ---------------------------------------------------------------------------


def test_an_empty_description_leaves_no_stray_separator():
    """
    A leading ". " would be fed to the rules as part of the text.

    Harmless to a regex, but it is what a person sees if the description is
    ever echoed back to them, and it is the kind of thing that turns into a
    bug the first time something splits on the separator.
    """
    merged = merge_selected_symptoms("", ["a sore throat", "a fever"])

    assert merged == "a sore throat. a fever"
    assert not merged.startswith(".")
    assert ".." not in merged


def test_a_single_picked_phrase_is_just_that_phrase():
    assert merge_selected_symptoms("", ["a headache"]) == "a headache"


def test_a_red_flag_picked_alone_still_reaches_emergency_screening():
    """
    ⛔ THE ONE THAT MATTERS MOST IN THIS FILE.

    Somebody who taps "chest pain" and types nothing is the exact person this
    change was made for, and they must not be worse off than somebody who
    typed the same two words. If the merge ever produced text the screening
    could not read, this is where it would show.
    """
    merged = merge_selected_symptoms("", ["chest pain"])

    guidance = screen_for_emergency(merged)

    assert guidance is not None
    assert guidance.category == "cardiac"
    assert classify(merged).tier_name == "EMERGENT"


def test_a_picked_red_flag_survives_the_merge_from_a_standing_start():
    """
    The merge itself, with no surrounding sentence to carry the phrase.

    ⛔ THE PER-PHRASE CHECK LIVES IN `test_picker_coverage.py`, NOT HERE, AND
    THE REASON IS WORTH KEEPING.

    This test first held a list of labels copied out of `symptomVocabulary.ts`
    — one per emergency category — and its own docstring admitted the weakness:
    the vocabulary is TypeScript, Python cannot import it, so a label edited
    there and not here goes unnoticed. That is not a hypothetical either. Three
    of those copied labels were reworded within the hour (to make them screen
    at all), and this test went red for a reason that had nothing to do with
    the behaviour it was checking.

    So the duplication was deleted rather than updated. `test_picker_coverage.py`
    reads the TypeScript file and keys its expectations on **entry id**, so a
    reworded label is still screened and a deleted one is reported as missing.
    What is left here is what belongs here: that `merge_selected_symptoms`
    does not damage a phrase on the way through when it is the whole
    description.
    """
    for phrase, category in (
        ("chest pain", "cardiac"),
        ("shortness of breath", "breathing"),
        ("my face is drooping on one side", "stroke"),
    ):
        merged = merge_selected_symptoms("", [phrase])

        assert merged == phrase, "the merge altered a phrase that stood alone"
        guidance = screen_for_emergency(merged)
        assert guidance is not None and guidance.category == category


def test_tapping_a_minor_phrase_alone_can_still_earn_self_care():
    """
    Tap-only must not collapse into "everything is URGENT".

    If every tap-only submission defaulted, the feature would be a slower way
    of being told to see somebody — which is the over-triage cost CLAUDE.md
    already warns makes a tier stop meaning anything.
    """
    merged = merge_selected_symptoms("", ["a sore throat"])

    assert classify(merged).tier_name == "SELF_CARE"
