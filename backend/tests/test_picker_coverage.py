"""
The picker may not offer a red-flag phrase the screening cannot read.

⛔ WHY THIS IS A TEST AND NOT JUST A SCRIPT.

The symptom vocabulary lives in `mobile/src/services/symptomVocabulary.ts` and
the screening lives in `app/core/emergency.py`. Nothing could see both halves
at once, so a phrase could be offered on one side of the wire and be
unreadable on the other — and that was not hypothetical. When
`scripts/check_picker_coverage.py` was first run it found **ten** such
phrases, seven of them already shipped, including the labels for a suspected
overdose, a facial droop and the worst headache of somebody's life.

A phrase MedHelp puts in front of a person and then fails to recognise is
worse than one it never offered: they tapped the app's own words and got less
than if they had typed their own, and nothing told them so.

This runs the script's check in-process so a vocabulary edit that breaks it
fails the suite rather than waiting for somebody to remember the script.
"""

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND / "scripts"))

from check_picker_coverage import (  # noqa: E402
    _CATEGORY_ALIASES,
    MUST_SCREEN,
    load_entries,
)

from app.core.emergency import screen_for_emergency  # noqa: E402
from app.core.rules_triage import classify  # noqa: E402


@pytest.fixture(scope="module")
def labels() -> dict[str, str]:
    entries = load_entries()
    assert entries, "parsed no entries — has the vocabulary's shape changed?"
    return dict(entries)


def test_the_vocabulary_is_readable_from_here(labels):
    """
    The parse is the load-bearing part of this file.

    If the TypeScript is reformatted so the regex stops matching, every other
    test here would pass vacuously over an empty list. Assert it found a
    plausible number of entries rather than merely a non-zero one.
    """
    assert len(labels) > 100
    assert "chest-pain" in labels


@pytest.mark.parametrize("entry_id", sorted(MUST_SCREEN))
def test_a_red_flag_the_picker_offers_reaches_its_category(entry_id, labels):
    expected = _CATEGORY_ALIASES.get(MUST_SCREEN[entry_id], MUST_SCREEN[entry_id])

    label = labels.get(entry_id)
    assert label is not None, (
        f"{entry_id!r} is expected to screen as {expected} but is no longer in "
        "the vocabulary. Removing it is a decision, not a tidy-up — say so here."
    )

    guidance = screen_for_emergency(label)
    assert guidance is not None, (
        f"the picker offers {label!r} and emergency screening reads it as "
        "NOTHING. Either the label drifted from the phrase list or the phrase "
        "list lost a phrase; do not fix this by deleting the expectation."
    )
    assert guidance.category == expected

    # And the whole way through, not just the screen: a red flag has to arrive
    # as EMERGENT once the rule layer has had it.
    assert classify(label).tier_name == "EMERGENT"


def test_every_offered_phrase_classifies_without_error(labels):
    """
    No phrase the picker offers may crash or come back tierless.

    Cheap, and it is the only thing covering the ~150 entries that are not red
    flags. They are expected to reach the URGENT default — that is the designed
    answer to "we do not understand this" — but they must reach *something*.
    """
    for entry_id, label in labels.items():
        result = classify(label)
        assert result.tier_name in {"EMERGENT", "URGENT", "SELF_CARE"}, entry_id


def test_no_offered_phrase_is_empty_or_punctuation_only(labels):
    """A label is inserted into the description verbatim; a blank one is a gap."""
    for entry_id, label in labels.items():
        assert label.strip(), entry_id
        assert any(character.isalnum() for character in label), entry_id
