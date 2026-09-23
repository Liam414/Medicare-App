"""
The held-out probe sets, as a ratchet, and the 2026-09-22 patch's edges.

⛔ Read `scripts/triage_eval/heldout.py` first. HELDOUT was frozen before any
phrase was added and must never be tuned to; these floors only stop it getting
worse. The honest summary of the patch they guard: TUNING 5/39 → 36/39 (the
misses it was written from), HELDOUT 14/39 → 15/39. Phrase lists fix the
phrases you have seen, not the class. Synthetic data only.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

from app.core.rules_triage import classify

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "triage_eval" / "measure_heldout.py"
_spec = importlib.util.spec_from_file_location("measure_heldout_for_tests", _PATH)
_measure = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _measure
_spec.loader.exec_module(_measure)


def test_tuning_set_does_not_regress():
    result = _measure.score(_measure.heldout.TUNING)
    assert result["caught"] >= 36


def test_heldout_set_does_not_regress():
    result = _measure.score(_measure.heldout.HELDOUT)
    assert result["caught"] >= 15


@pytest.mark.parametrize("cases", ["TUNING", "HELDOUT"])
def test_no_urgent_or_emergent_case_is_ever_told_self_care(cases):
    # The catastrophic direction. A number used to defeat every duration rule:
    # "sore throat for 10 days" earned SELF_CARE.
    for case in getattr(_measure.heldout, cases):
        if case.gold != "SELF_CARE":
            assert classify(case.description).tier_name != "SELF_CARE", case.description


@pytest.mark.parametrize(
    "text",
    [
        "sore throat for 10 days",
        "sore throat and fever for 5 days",
        "a cold for two weeks",
        "runny nose for 3 days",
    ],
)
def test_a_numeric_duration_voids_self_care(text):
    assert classify(text).tier_name != "SELF_CARE"


@pytest.mark.parametrize(
    "text, category",
    [
        ("he's not breathing", "breathing"),
        ("she won't wake up", "consciousness"),
        ("I took 20 tylenol", "overdose_poisoning"),
        ("i wanna kms", "self_harm"),
        ("my baby is 6 weeks old and has a temp of 100.8", "infant_fever"),
        ("chest pian and my left arm is numb", "cardiac"),
    ],
)
def test_the_reported_misses_now_get_emergency_guidance(text, category):
    result = classify(text)
    assert result.tier_name == "EMERGENT"
    assert result.emergency.category == category


@pytest.mark.parametrize(
    "text",
    [
        # Each is an ordinary sentence one of the new rules was built to leave
        # alone. A red flag that fires on these teaches people to ignore it.
        "I ran 5 kms this morning and my knee aches",
        "the appointment took 20 minutes",
        "I took 20 mg of ibuprofen",
        "my shoulder has gone stiff and I can't lift my arm up",
        "my fingers turn blue in the cold",
        "I have food poisoning, cramps and diarrhea",
    ],
)
def test_ordinary_sentences_get_no_emergency_guidance(text):
    assert classify(text).emergency is None
