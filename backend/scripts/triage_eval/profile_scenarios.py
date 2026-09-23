"""
Triage scenarios that carry a health profile: description + profile + the
level of care this app's documented intent expects.

    cd backend
    python scripts/triage_eval/profile_scenarios.py

SYNTHETIC ONLY. Gold levels are this app's own documented intent, assigned by
a software engineer, not clinical validation — the same standing as every
corpus in this directory. EMERGENT is only given where `emergency.py` already
defines a category covering the description.

⛔ Written 2026-09-22 and FROZEN BEFORE IT WAS FIRST RUN, the rule `heldout.py`
sets: never add a phrase to a fenced list because a case here missed. Write a
new set instead. The ratchet in `tests/test_triage_scenarios.py` only stops
the score getting worse.

`profile_dependent` marks cases whose expected level rests on the profile
(e.g. a description that names something on the person's own allergy list).
Until triage reads the profile (Phase 3, owner decision 1) those are scored
separately and are expected to miss; that gap is the point of carrying them.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

E, U, S = "EMERGENT", "URGENT", "SELF_CARE"
_RANK = {S: 0, U: 1, E: 2}


@dataclass(frozen=True)
class Scenario:
    description: str
    gold: str
    basis: str
    conditions: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()
    profile_dependent: bool = False


def _p(conditions: tuple[str, ...] = (), allergies: tuple[str, ...] = ()) -> dict:
    return {"conditions": conditions, "allergies": allergies}


ASTHMA = _p(conditions=("asthma",))
DIABETES = _p(conditions=("type 2 diabetes",))
HEART = _p(conditions=("had a heart attack in 2019",))
PEANUT = _p(allergies=("peanuts",))
PENICILLIN = _p(allergies=("penicillin",))
NONE = _p()

SCENARIOS: list[Scenario] = [
    # --- Red flags (25). A profile never lowers these. ---------------------
    Scenario("my chest is really tight and it's spreading to my jaw", E, "screening intent: cardiac", **HEART),
    Scenario("sharp pain in the middle of my chest and I feel sick and sweaty", E, "screening intent: cardiac", **DIABETES),
    Scenario("I can't breathe properly, my inhaler isn't helping", E, "screening intent: breathing", **ASTHMA),
    Scenario("my lips are going blue", E, "screening intent: breathing", **NONE),
    Scenario("gasping for air and can't finish a sentence", E, "screening intent: breathing", **ASTHMA),
    Scenario("one side of my face is drooping and my speech is slurred", E, "screening intent: stroke", **HEART),
    Scenario("suddenly can't lift my right arm and my words are coming out wrong", E, "screening intent: stroke", **NONE),
    Scenario("my dad's face looks lopsided and he's confused", E, "screening intent: stroke", **DIABETES),
    Scenario("cut my hand and it won't stop bleeding, it's soaking through towels", E, "screening intent: bleeding_trauma", **NONE),
    Scenario("I'm vomiting blood", E, "screening intent: bleeding_trauma", **NONE),
    Scenario("I fell off a ladder and hit my head hard", E, "screening intent: bleeding_trauma", **NONE),
    Scenario("my throat is swelling up after eating peanuts", E, "screening intent: anaphylaxis", **PEANUT),
    Scenario("my tongue is swelling and I'm having trouble swallowing", E, "screening intent: anaphylaxis", **PENICILLIN),
    Scenario("hives all over and my throat feels tight", E, "screening intent: anaphylaxis", **NONE),
    Scenario("she passed out and isn't waking up", E, "screening intent: consciousness", **NONE),
    Scenario("my son is having a seizure", E, "screening intent: consciousness", **NONE),
    Scenario("I fainted twice this morning", E, "screening intent: consciousness", **HEART),
    Scenario("I want to kill myself", E, "screening intent: self_harm", **NONE),
    Scenario("I've been thinking about ending my life", E, "screening intent: self_harm", **NONE),
    Scenario("I don't want to be alive anymore", E, "screening intent: self_harm", **NONE),
    Scenario("I took too many of my sleeping pills on purpose", E, "screening intent: overdose_poisoning", **NONE),
    Scenario("my toddler drank some bleach", E, "screening intent: overdose_poisoning", **NONE),
    Scenario("suddenly lost the vision in one eye", E, "screening intent: vision_loss", **DIABETES),
    Scenario("stiff neck and a high fever and the light hurts my eyes", E, "screening intent: sepsis_meningitis", **NONE),
    Scenario("I'm pregnant and bleeding heavily", E, "screening intent: pregnancy", **NONE),
    # --- Be seen soon ------------------------------------------------------
    Scenario("sore throat for over a week and it's getting worse", U, "persistent_or_worsening", **NONE),
    Scenario("I think I broke my wrist, it's swollen and I can't move it", U, "possible_fracture", **NONE),
    Scenario("a cut on my leg is red, hot and oozing", U, "infection_signs", **DIABETES),
    Scenario("fever for four days that won't come down", U, "fever_with_duration", **NONE),
    Scenario("I can't keep any water down since last night", U, "cannot_keep_fluids_down", **NONE),
    Scenario("found a new lump in my neck", U, "new_lump_or_unexplained_change", **NONE),
    Scenario("my knee has been aching on and off", U, "safe default: nothing recognised", **NONE),
    # --- Self-care ---------------------------------------------------------
    Scenario("I have a cold and a runny nose", S, "self-limiting complaint", **NONE),
    Scenario("mild sunburn on my shoulders from yesterday", S, "self-limiting complaint", **NONE),
    Scenario("a few mosquito bites that itch", S, "self-limiting complaint", **PENICILLIN),
    # --- Profile-dependent: expected to miss until triage reads the profile.
    Scenario(
        "I think I just ate something with peanuts in it",
        U,
        "names an entry on the person's own allergy list",
        profile_dependent=True,
        **PEANUT,
    ),
    Scenario(
        "the doctor gave me penicillin this morning and now I have a rash",
        U,
        "names an entry on the person's own allergy list",
        profile_dependent=True,
        **PENICILLIN,
    ),
    Scenario(
        "I have a cold and a runny nose",
        U,
        "recorded long-term condition: self-care is not earned without review",
        profile_dependent=True,
        **HEART,
    ),
    Scenario(
        "a small cut on my foot that is taking a while to heal",
        U,
        "recorded long-term condition: self-care is not earned without review",
        profile_dependent=True,
        **DIABETES,
    ),
]


def classify(scenario: Scenario) -> str:
    """Rules only, the layer that always runs. The profile is not an input yet."""
    from app.core.rules_triage import classify as rules

    return rules(scenario.description).tier_name


def score(scenarios: list[Scenario]) -> dict:
    results = [(s, classify(s)) for s in scenarios]
    red = [(s, got) for s, got in results if s.gold == E]
    return {
        "n": len(results),
        "exact": sum(got == s.gold for s, got in results),
        "under": [(s, got) for s, got in results if _RANK[got] < _RANK[s.gold]],
        "over": sum(_RANK[got] > _RANK[s.gold] for s, got in results),
        "red_flags": len(red),
        "red_caught": sum(got == E for _, got in red),
    }


def main() -> None:
    for title, subset in (
        ("PROFILE-INDEPENDENT", [s for s in SCENARIOS if not s.profile_dependent]),
        ("PROFILE-DEPENDENT", [s for s in SCENARIOS if s.profile_dependent]),
    ):
        r = score(subset)
        print(f"{title}  n={r['n']}  exact {r['exact']}/{r['n']}  under {len(r['under'])}  over {r['over']}", end="")
        if r["red_flags"]:
            print(f"  red flags caught {r['red_caught']}/{r['red_flags']}", end="")
        print()
        for s, got in r["under"]:
            print(f"    gold {s.gold:<9} got {got:<9} {s.description!r}")


if __name__ == "__main__":
    main()
