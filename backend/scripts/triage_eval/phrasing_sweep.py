"""
Does an existing red-flag category recognise ordinary ways of describing it?

    cd backend
    python scripts/triage_eval/phrasing_sweep.py
    python scripts/triage_eval/phrasing_sweep.py --show-caught

⛔ THIS IS A DIFFERENT QUESTION FROM THE OTHER TWO HARNESSES, AND IT IS THE
ONE THEY CANNOT ASK. `measure.py` and `measure_common_illness.py` score the
rule layer against corpora, and both report 100% safety of advice. This asks
whether the phrase lists recognise wordings nobody wrote them from — and the
answer, as of 2026-09-20, is that most of the time they do not.

Every description below is a lay phrasing of a presentation `emergency.py`
**already has a category for**. So a miss is a phrasing gap inside an existing
category, never an argument for a new one — which matters, because inventing a
category is a clinician's call this repo fences, while the copy that would be
shown already exists and is already reviewed.

## ⛔ What a number from this establishes, and what it does not

The descriptions are **an engineer's idea of how a frightened person writes**.
They are not transcripts, not validated, and not clinician-reviewed — exactly
the standing of the gold labels in `corpus.py`, and the same caveat applies:
this measures the phrase lists against one person's guess at natural language.
A real miss rate would need real user text, which this project does not have
and should not collect for this purpose.

What it is good for is direction and magnitude. A category that recognises
none of six ordinary descriptions of itself is not a borderline call.

## ⛔ What a miss costs, stated precisely

A miss is **not** a reassurance. The rule layer defaults to URGENT — "get this
checked" — and `escalation_guidance` still travels with the response, so the
person is told to call 911 if things change or they are worried. What they do
not get is the category headline, the number to ring, and the instruction to
ring it now. For an overdose that is Poison Control; for self-harm that is 988.

So read a miss as: *the app said see someone soon, where it should have said
call an ambulance.* That is the one-directional safety property working as
designed, and it is still the wrong answer.

## ⛔ Fixing these is fenced

Closing any line here means editing `_EMERGENCY_RULES` in `app/core/emergency.py`,
which CLAUDE.md puts behind explicit human approval obtained outside the agent
pipeline, and which a clinician should read. This script exists so that the
conversation starts from a measurement instead of an anecdote. Do not "fix" a
row by deleting it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Same fix as `scripts/live_probe/`, and this script needed it for the same
# reason one commit later: it prints ⛔ and a Windows console is cp1252, so it
# died on its own heading. Worth stating rather than quietly patching — the
# defect I had just fixed elsewhere reappeared here within the hour, which is
# what a repository-wide convention is for.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from app.core import emergency  # noqa: E402


# Each key is a category id that ALREADY exists in `_EMERGENCY_RULES`. Each
# value is a list of ordinary ways someone might describe that presentation.
#
# ⛔ SYNTHETIC INPUT ONLY. Every line is invented for this sweep. Never paste a
# real person's description in here — CLAUDE.md's synthetic-data-only rule
# applies to this file as to every other.
PHRASINGS: dict[str, tuple[str, ...]] = {
    "cardiac": (
        "my chest feels like an elephant is sitting on it",
        "there is a heavy weight on my chest",
        "my chest is being crushed",
        "a band is tightening around my chest",
        "my left arm has gone numb and my chest hurts",
        "burning in the middle of my chest and I feel sick",
        "my jaw and my arm ache and I feel clammy",
        "I think I am having a heart attack",
    ),
    "breathing": (
        "my lips are turning blue",
        "I am wheezing and cannot speak a full sentence",
        "I am gasping for air",
        "my inhaler is not touching it",
        "I am fighting to breathe",
        "I feel like I am suffocating",
    ),
    "stroke": (
        "half my face has gone slack",
        "my words are coming out as nonsense",
        "I cannot lift my right arm at all",
        "one side of me has gone dead",
        "I woke up and could not speak properly",
    ),
    "bleeding_trauma": (
        "blood is pouring from the cut and won't stop",
        "I threw up something that looked like coffee grounds",
        "blood is spurting out",
        "I am soaking through the bandage",
        "my stools are black and sticky",
        "I cannot stop the bleeding",
    ),
    "anaphylaxis": (
        "my face is puffing up and I feel faint",
        "I used my epipen and still feel terrible",
        "my throat feels like it is closing",
        "I came out in hives and my chest is tight",
    ),
    "consciousness": (
        "I keep passing in and out",
        "he is unresponsive",
        "she will not wake up",
        "I went out cold",
        "my child had a convulsion",
    ),
    "self_harm": (
        "I want to end it all",
        "I have a plan to kill myself",
        "everyone would be better off without me",
        "I don't want to be here any more",
    ),
    "overdose_poisoning": (
        "I took the whole bottle of pills",
        "I swallowed a load of tablets",
        "my toddler drank the bleach",
        "I have taken an overdose",
        "he drank something from under the sink",
    ),
    "vision_loss": (
        "it's like a curtain came down over one eye",
        "everything went black in my right eye",
        "I have lost the sight in one eye",
        "a shadow is covering half my vision",
    ),
    "infant_fever": (
        "my baby is burning up and floppy",
        "my newborn feels boiling and won't feed",
        "my three week old has a temperature",
    ),
    "pregnancy": (
        "I am pregnant and bleeding heavily",
        "I am 30 weeks and have terrible stomach pain",
        "I am expecting and passing clots",
    ),
    "sepsis_meningitis": (
        "my neck is stiff and I have a fever",
        "a rash that does not fade when I press a glass on it",
        "I am confused and burning up",
    ),
}


# ⛔ THE CATASTROPHIC DIRECTION, AND WHY IT LIVES HERE RATHER THAN IN corpus.py.
#
# Everything above is a missed escalation: URGENT instead of EMERGENT, "get
# seen soon" instead of "call an ambulance". These are different in kind — they
# come back SELF_CARE, the app telling somebody their problem will settle on
# its own.
#
# They are not in `corpus.py` because the honest gold for the first is
# EMERGENT, and a gold-EMERGENT case returning SELF_CARE fails
# `test_no_gold_emergent_case_is_ever_returned_as_self_care`, whose docstring
# says "this must be zero, always, no exceptions". That test is right, and
# recording these as documented gaps would turn the repo's strongest safety
# assertion into an exception. So they are measured here, in a script that
# always exits 0 and cannot hide behind a green tick, and reported in
# `docs/test-run-2026-09-20.md` as FINDING 0.
#
# ⛔ Each entry is (description, what it must NOT be). Fixing either means
# editing a fenced module.
FALSE_SELF_CARE: tuple[tuple[str, str], ...] = (
    # "can't catch my breath" fires; the written-out "cannot" does not. So the
    # red flag misses while "a dry cough" earns self-care positively, and
    # "cannot catch my breath" is not an escalating modifier to take it back.
    # The app's own reviewed lists say this description is EMERGENT — it is
    # defeated by spelling, not by a clinical judgement.
    ("a dry cough and I cannot catch my breath", "SELF_CARE"),
    # "sore throat" earns self-care; neither "drooling" nor "cannot swallow" is
    # an escalating modifier. Whether this deserves its own red-flag category
    # is a clinician's call; that it is not self-care is not.
    ("sore throat and I am drooling and cannot swallow", "SELF_CARE"),
)


def false_self_care() -> list[tuple[str, str]]:
    """Descriptions that come back as reassurance. Empty is the only good answer."""
    from app.core import rules_triage

    return [
        (description, forbidden)
        for description, forbidden in FALSE_SELF_CARE
        if rules_triage.classify(description).tier_name == forbidden
    ]


# Ordinary self-limiting complaints somebody might mention in the same breath
# as something serious. People list symptoms together; they do not submit one
# clean red flag per box.
_SELF_CARE_OPENERS: tuple[str, ...] = (
    "a dry cough and",
    "a sore throat and",
    "a head cold and",
    "a mild headache and",
    "a runny nose and",
)


def reassurance_cross_product() -> tuple[int, list[str]]:
    """
    Every missed red flag above, placed beside a recognised minor complaint.

    ⛔ THIS IS WHERE THE PHRASING GAP STOPS BEING UNDER-TRIAGE AND BECOMES
    REASSURANCE. A missed red flag on its own falls to the URGENT default,
    which is wrong but safe. In the same sentence as a self-limiting complaint
    the minor phrase matches POSITIVELY, nothing escalates it, and the whole
    description comes back SELF_CARE.

    Returns `(combinations_checked, descriptions_that_returned_self_care)`.
    """
    from app.core import rules_triage

    reassured: list[str] = []
    checked = 0
    for descriptions in PHRASINGS.values():
        for red_flag in descriptions:
            for opener in _SELF_CARE_OPENERS:
                text = f"{opener} {red_flag}"
                checked += 1
                if rules_triage.classify(text).tier_name == "SELF_CARE":
                    reassured.append(text)
    return checked, reassured


def sweep() -> dict[str, list[tuple[str, str | None]]]:
    """For each category, every phrasing and the category it actually reached."""
    results: dict[str, list[tuple[str, str | None]]] = {}
    for category, descriptions in PHRASINGS.items():
        rows: list[tuple[str, str | None]] = []
        for description in descriptions:
            guidance = emergency.screen_for_emergency(description)
            rows.append((description, guidance.category if guidance else None))
        results[category] = rows
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--show-caught",
        action="store_true",
        help="list the phrasings that were recognised, not only the misses",
    )
    args = parser.parse_args()

    results = sweep()
    total = sum(len(rows) for rows in results.values())
    missed = sum(1 for rows in results.values() for _, got in rows if got is None)

    print("=" * 74)
    print(" Lay phrasings of EXISTING red-flag categories")
    print("=" * 74)
    print(" Measures the phrase lists against one engineer's idea of how a")
    print(" frightened person writes. Not validated, not clinician-reviewed,")
    print(" and not a clinical miss rate. See this file's docstring.")
    print()
    print("  cases      %d" % total)
    print("  recognised %d" % (total - missed))
    print("  MISSED     %d  (%.0f%%)" % (missed, 100 * missed / total))
    print()

    for category, rows in results.items():
        misses = [description for description, got in rows if got is None]
        print("  %-20s %d/%d recognised" % (category, len(rows) - len(misses), len(rows)))
        for description in misses:
            print("        MISS   %s" % description)
        if args.show_caught:
            for description, got in rows:
                if got is not None:
                    print("        ok     %s   -> %s" % (description, got))

    print()
    print("  ⛔ A miss above is URGENT plus the standing escalation line, never")
    print("     a reassurance — but it is not the category headline and not the")
    print("     number to ring. Closing one means editing a fenced module.")

    print()
    print("-" * 74)
    print(" ⛔⛔ FALSE SELF_CARE — told it will settle on its own")
    print("-" * 74)
    reassured = false_self_care()
    if reassured:
        print("  %d description(s) come back as REASSURANCE:" % len(reassured))
        for description, _ in reassured:
            print("      %s" % description)
        print()
        print("  This is a different kind of failure from every miss above.")
        print("  A miss says 'get seen soon'. This says 'you are fine'.")
        print("  See docs/test-run-2026-09-20.md, FINDING 0.")
    else:
        print("  None. Every one now escapes the self-care list.")
        print("  ⛔ If this stays empty, delete the entries rather than leaving")
        print("     a passing list nobody reads — and move them into corpus.py,")
        print("     where the floor test will keep them closed.")

    checked, reassured = reassurance_cross_product()
    print()
    print("  Each missed red flag above, beside an ordinary minor complaint:")
    print("    combinations   %d" % checked)
    print("    reassured      %d  (%.0f%%)" % (
        len(reassured), 100 * len(reassured) / checked if checked else 0))
    for text in reassured[:8]:
        print("       %s" % text)
    if len(reassured) > 8:
        print("       ... and %d more" % (len(reassured) - 8))
    print()
    print("  ⛔ These are not separate defects. They are the phrasing gap above")
    print("     meeting the rule that self-care matches positively — which is")
    print("     what turns under-triage into reassurance. Closing the phrasing")
    print("     gap closes almost all of them.")
    # ⛔ Always zero. This reports; it does not gate. A sweep of invented
    # phrasings must never be able to fail somebody's build, and a threshold
    # here would imply these numbers carry an authority they do not have.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
