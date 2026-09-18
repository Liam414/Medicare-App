"""
Runs every phrase the symptom picker offers through the real rule layer.

    cd backend
    python scripts/check_picker_coverage.py
    python scripts/check_picker_coverage.py --strict     # non-zero exit on a
                                                         # red flag that misses
    python scripts/check_picker_coverage.py --defaults   # list what nothing
                                                         # recognised

⛔ WHY THIS EXISTS, AND WHY IT READS TYPESCRIPT FROM PYTHON.

The symptom vocabulary lives in `mobile/src/services/symptomVocabulary.ts`,
on the device, because a partially typed symptom is health text and an
autocomplete is the canonical shape of a GET with user text in a query string.
That decision is right and is not being revisited here.

Its consequence is a seam. The phrases are chosen on one side of the wire and
screened on the other, in a different language, and **nothing could see both
halves at once**. So the app could offer somebody the words "losing vision",
and the emergency screening — which holds "sudden vision loss", "lost my
vision" and "lost vision in", and no present participle — could read them as
nothing at all. That is not hypothetical: it was true of three phrases when
this script was first run, including one that named an overdose.

A phrase MedHelp puts in front of a person and then fails to recognise is
worse than one it never offered. The person tapped the app's own words and got
less than if they had typed their own, and nothing anywhere told them so.

So this parses the TypeScript. That is ugly, and it is much less ugly than the
alternative — a second copy of a clinical vocabulary in Python, which CLAUDE.md
already refuses for this exact reason elsewhere: "two copies drift, and one of
them would eventually be offering a phrase the other had removed".

⛔ WHAT A NUMBER FROM THIS IS. Coverage of this app's own phrase lists by this
app's own picker. It says nothing about whether either is clinically right —
no clinician has read the vocabulary or the phrase lists, and the release
blocker in CLAUDE.md is untouched by anything here.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))  # backend/, so `app.*` resolves

from app.core.emergency import screen_for_emergency  # noqa: E402
from app.core.rules_triage import classify  # noqa: E402

VOCABULARY = (
    HERE.parent.parent / "mobile" / "src" / "services" / "symptomVocabulary.ts"
)

# One entry per line, written by hand in the TS file:
#   { id: "chest-pain", label: "chest pain", synonyms: [...], area: "chest" },
_ENTRY = re.compile(
    r"""\{\s*id:\s*"(?P<id>[^"]+)"\s*,\s*label:\s*"(?P<label>[^"]+)"\s*,""",
)


# ---------------------------------------------------------------------------
# ⛔ The phrases that MUST reach emergency screening.
# ---------------------------------------------------------------------------
#
# Keyed by **id, not label**, deliberately. Keying on the label would mean that
# rewording an entry silently dropped its check — and rewording is exactly the
# edit that broke these in the first place. Keyed by id, a reworded label is
# still screened, and a *deleted* entry is reported as missing rather than
# passing by absence.
#
# This is a duplication of intent across the seam and there is no way around
# that: the vocabulary cannot carry a tier of its own, because
# `test_no_entry_carries_a_severity` pins its field set to exactly id, label,
# synonyms and area — a symptom that arrived pre-labelled "emergency" would be
# the per-symptom clinical claim the picker is explicitly not allowed to make.
#
# So the expectation lives here, outside the vocabulary, where it is a
# statement about screening rather than a property of a symptom.
MUST_SCREEN: dict[str, str] = {
    "chest-pain": "cardiac",
    "chest-pressure": "cardiac",
    "pain-to-arm": "cardiac",
    "breathless": "breathing",
    "throat-closing": "anaphylaxis",
    "swelling-lips": "anaphylaxis",
    "swelling-tongue": "anaphylaxis",
    "coughing-blood": "bleeding_trauma",
    "vomiting-blood": "bleeding_trauma",
    "stool-black": "bleeding_trauma",
    "head-injury": "injuries-or-bleeding",
    "face-drooping": "stroke",
    "weakness-one-side": "stroke",
    "slurred-speech": "stroke",
    "words-trouble": "stroke",
    "worst-headache": "stroke",
    "seizure": "consciousness",
    "fainted": "consciousness",
    "self-harm": "self_harm",
    "vision-loss": "vision_loss",
    "curtain-vision": "vision_loss",
    "rash-no-fade": "sepsis_meningitis",
    "child-temperature": "infant_fever",
    "pregnancy-bleeding": "pregnancy",
    "med-too-many": "overdose_poisoning",
}

# `head-injury` screens under bleeding_trauma, whose copy covers a serious
# injury. Named loosely above so the intent reads; resolved here.
_CATEGORY_ALIASES = {"injuries-or-bleeding": "bleeding_trauma"}


def load_entries() -> list[tuple[str, str]]:
    """(id, label) for every entry in the vocabulary, in file order."""
    if not VOCABULARY.exists():
        raise SystemExit(f"vocabulary not found at {VOCABULARY}")
    source = VOCABULARY.read_text(encoding="utf-8")
    return [(m.group("id"), m.group("label")) for m in _ENTRY.finditer(source)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--defaults", action="store_true")
    args = ap.parse_args()

    entries = load_entries()
    if not entries:
        raise SystemExit("parsed no entries — has the vocabulary's shape changed?")

    by_id = dict(entries)
    tiers: Counter[str] = Counter()
    defaulted: list[tuple[str, str]] = []

    for entry_id, label in entries:
        result = classify(label)
        tiers[result.tier_name] += 1
        if result.defaulted:
            defaulted.append((entry_id, label))

    print("=" * 74)
    print(" Symptom picker — every offered phrase, through the rule layer")
    print("=" * 74)
    print(" Coverage of this app's phrase lists by this app's picker. NOT a")
    print(" clinical statement: no clinician has read either list.")
    print()
    print(f"  phrases offered      {len(entries)}")
    for tier in ("EMERGENT", "URGENT", "SELF_CARE"):
        print(f"  {tier:<20} {tiers[tier]}")
    recognised = len(entries) - len(defaulted)
    share = 100.0 * recognised / len(entries)
    print(f"  recognised by a rule {recognised}/{len(entries)}  ({share:.1f}%)")
    print()

    # ------------------------------------------------------------------
    # The part that can fail the build.
    # ------------------------------------------------------------------
    print("-" * 74)
    print(" RED FLAGS THE PICKER OFFERS")
    print("-" * 74)

    misses: list[str] = []
    for entry_id, expected in MUST_SCREEN.items():
        expected = _CATEGORY_ALIASES.get(expected, expected)
        label = by_id.get(entry_id)

        if label is None:
            misses.append(f"    GONE    {entry_id!r} is no longer in the vocabulary")
            continue

        guidance = screen_for_emergency(label)
        if guidance is None:
            misses.append(
                f"    MISS    {entry_id:<22} {label!r} screens as NOTHING"
            )
        elif guidance.category != expected:
            misses.append(
                f"    WRONG   {entry_id:<22} {label!r} -> {guidance.category}, "
                f"expected {expected}"
            )

    if misses:
        for line in misses:
            print(line)
        print()
        print(f"    {len(misses)} of {len(MUST_SCREEN)} red-flag phrases do not screen.")
        print("    A phrase the app OFFERS and then cannot read is worse than one")
        print("    it never offered — the person tapped MedHelp's own words.")
    else:
        print(f"    all {len(MUST_SCREEN)} reach the category they should")
    print()

    if args.defaults:
        print("-" * 74)
        print(f" RECOGNISED BY NOTHING  ({len(defaulted)})")
        print("-" * 74)
        print(" Not failures. These fall to the URGENT default, which is the")
        print(" designed answer to 'we do not understand this'. Worth reading")
        print(" because each one is a phrase the app offers and the rules have")
        print(" nothing to say about.")
        for entry_id, label in defaulted:
            print(f"    {entry_id:<24} {label!r}")
        print()

    if args.strict and misses:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
