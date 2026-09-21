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


# ⛔ THE CONCEPT COMBINATOR'S OWN LEXICON HAS THE SAME GAP.
#
# `symptom_concepts.py` exists because a literal phrase list could not express
# "stiff neck AND fever" in any order, and it closed that. But its lexicon is
# itself lexical — six concepts, 8 to 26 terms each — and its docstring says
# so: "the lexicon is lexical, so an unlisted synonym is still a miss."
#
# That limit had never been measured. These are ordinary ways of describing
# the three combinations it knows, and the misses are not exotic:
#
#   "sore stiff neck with a high temp"   contains `stiff neck`, but `high temp`
#                                        is not one of the fever terms
#   "a rash that will not blanch"        `blanch` is the word a clinician uses
#   "his temperature is 40"              a number, which no term can match
#   "neck pain and a fever"              `neck pain` is not `stiff neck`
#
# ⛔ REPORTED, NOT FIXED, and deliberately not by adding a combination. The set
# of three is fenced by `test_the_set_of_combinations_is_fenced` and a fourth
# is a new clinical claim. What these need is more TERMS in existing concepts,
# which changes emergency-routing behaviour and so goes to the owner like
# everything else here.
_COMBINATION_PHRASINGS: tuple[str, ...] = (
    # stiff_neck + fever
    "my neck hurts to move and I am burning up",
    "I cannot put my chin on my chest and I have a fever",
    "sore stiff neck with a high temp",
    "neck pain and a fever",
    "my neck feels locked and I am feverish",
    # rash + not fading
    "a rash that doesn't go away when pressed",
    "a rash that will not blanch",
    "purple spots that do not fade under a glass",
    # confusion + high fever
    "he seems muddled and his temperature is 40",
    "my mum is rambling and very hot",
)


def combination_misses() -> list[str]:
    """Lay descriptions of a known combination that reach no guidance."""
    return [
        description
        for description in _COMBINATION_PHRASINGS
        if emergency.screen_for_emergency(description) is None
    ]


# ⛔ CONTRACTIONS WRITTEN OUT IN FULL, AND WHAT THAT COSTS.
#
# `docs/test-run-2026-09-19.md` FINDING 1 records that the phrase lists carry
# both `can't` and `cant` and never the expansion, so "the third way everybody
# writes it matches nothing". That run counted the phrases affected. It did not
# measure what happens when the expansion shares a sentence with an ordinary
# complaint, and that is where it stops being under-triage:
#
#     "I don't want to be alive"                   -> EMERGENT, self_harm, 988
#     "I do not want to be alive"                  -> URGENT, no guidance
#     "a dry cough and I don't want to be alive"   -> EMERGENT, self_harm
#     "a dry cough and I do not want to be alive"  -> SELF_CARE
#
# A suicidal statement, written without the contraction, beside a cough, is
# answered with "this usually settles on its own".
#
# ⛔ REPORTED, NOT FIXED — `emergency.py` and `rules_triage.py` are fenced. The
# repair is mechanical and needs no clinical judgement at all: generate the
# expansion alongside each contraction when the patterns are compiled, the same
# way `plural_tolerant` already generates plurals. Nobody has to rule on
# whether a wording describes a condition; these are wordings the lists already
# hold, in the spelling nobody stored.
_CONTRACTIONS: tuple[tuple[str, str], ...] = (
    ("can't", "cannot"),
    ("won't", "will not"),
    ("don't", "do not"),
    ("didn't", "did not"),
    ("isn't", "is not"),
    ("couldn't", "could not"),
    ("haven't", "have not"),
    ("hasn't", "has not"),
    ("doesn't", "does not"),
    ("aren't", "are not"),
)


def _expanded(phrase: str) -> str:
    out = phrase
    for short, long in _CONTRACTIONS:
        out = out.replace(short, long)
    return out


def contraction_misses() -> tuple[list[str], list[str]]:
    """
    `(red flags lost when written out, those that become reassurance)`.

    The second list is the one that matters. A lost red flag on its own falls
    to URGENT; beside a recognised minor complaint it falls to SELF_CARE.
    """
    from app.core import rules_triage

    lost: list[str] = []
    reassured: list[str] = []
    seen: set[str] = set()

    for rule in emergency._EMERGENCY_RULES:
        for phrase in rule[3]:
            expanded = _expanded(phrase)
            if expanded == phrase or expanded in seen:
                continue
            seen.add(expanded)
            if emergency.screen_for_emergency(phrase) and not emergency.screen_for_emergency(
                expanded
            ):
                lost.append(f"{phrase}  ->  {expanded}")
                beside = f"a dry cough and {expanded}"
                if rules_triage.classify(beside).tier_name == "SELF_CARE":
                    reassured.append(beside)

    return lost, reassured


# ⛔ A HYPHEN WHERE THE LIST HAS A SPACE.
#
# `chest pain` is screened; `chest-pain` is not. `short of breath` is screened;
# `short-of-breath` is not. Every phrase in the lists is written with spaces,
# and a hyphen is not one, so the word boundary fails.
#
# This belongs with the contraction and invisible-character findings rather
# than with the vocabulary ones: it is MECHANICAL and BOUNDED. Treating a
# hyphen as a space in `normalize_query` closes it for every phrase at once,
# needs no clinical judgement, and is one-directional in exactly the way the
# existing case-split is — it only ever separates, never joins, so it can make
# screening more sensitive and cannot make it less.
#
# ⛔ NOT THE SAME AS A MISSPELLING, AND THE DIFFERENCE MATTERS. `siezure`,
# `unconcious` and `sucidal` also miss, and those are NOT proposed as fixable
# here: misspellings are an unbounded class, and closing them would mean fuzzy
# matching, which trades the determinism this whole rule layer is built on for
# a false-positive rate nobody has measured. A clinician can read a phrase
# list; nobody can read an edit-distance threshold. See the report.
_HYPHENATED_PROBES: tuple[tuple[str, str], ...] = (
    ("I have chest-pain", "I have chest pain"),
    ("I am short-of-breath", "I am short of breath"),
    ("I have chest-tightness", "I have chest tightness"),
)


def hyphen_misses() -> list[tuple[str, str]]:
    """Pairs where the spaced form screens and the hyphenated one does not."""
    return [
        (variant, canonical)
        for variant, canonical in _HYPHENATED_PROBES
        if emergency.screen_for_emergency(canonical)
        and not emergency.screen_for_emergency(variant)
    ]


# ⛔ INVISIBLE CHARACTERS THAT DEFEAT SCREENING ENTIRELY.
#
# `normalize_query` collapses `\s+`, and Python's `\s` on a str pattern matches
# Unicode whitespace — so a non-breaking space, a thin space and an ideographic
# space are all folded away and screening works. These are **category Cf**
# (format), not whitespace, so nothing touches them: they sit inside the phrase,
# the word boundary fails, and `I have chest⁠pain` matches nothing at all.
#
# This is the same origin as the glued-list bug `normalize_query` already fixes
# — that one was "found from a real submission" of pasted text. Pasting from a
# web page, a PDF or Word is exactly where these come from. A soft hyphen is
# what Word inserts at a line break; a BOM is what leads a file.
#
# ⛔ REPORTED, NOT FIXED. The fix is one line in `normalize_query` and is
# one-directional in the same way the existing case-split is — removing an
# invisible character can only make screening more sensitive. But CLAUDE.md
# records of the last edit to this very function that it "landed only after the
# user approved it directly in conversation" and that "no agent may repeat this
# on its own authority." So it is measured here and proposed in
# `docs/proposed-red-flag-phrases.md`.
INVISIBLE_CHARACTERS: tuple[tuple[str, str], ...] = (
    ("U+200B ZERO WIDTH SPACE", "​"),
    ("U+200C ZERO WIDTH NON-JOINER", "‌"),
    ("U+200D ZERO WIDTH JOINER", "‍"),
    ("U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM)", "﻿"),
    ("U+00AD SOFT HYPHEN", "­"),
    ("U+2060 WORD JOINER", "⁠"),
)


def invisible_character_misses() -> list[str]:
    """
    Names of invisible characters that stop `chest pain` being screened.

    The control cases — a non-breaking space, a thin space — are deliberately
    not here: they already work, and a list of things that pass is a list
    nobody reads.
    """
    misses: list[str] = []
    for name, character in INVISIBLE_CHARACTERS:
        description = f"I have chest{character} pain and I am sweating"
        if emergency.screen_for_emergency(description) is None:
            misses.append(name)
    return misses


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

    print()
    print("-" * 74)
    print(" ⛔ THE CONCEPT COMBINATOR'S LEXICON")
    print("-" * 74)
    combos = combination_misses()
    print("  lay descriptions of a KNOWN combination that reach nothing: %d of %d"
          % (len(combos), len(_COMBINATION_PHRASINGS)))
    for description in combos:
        print("      %s" % description)
    if combos:
        print()
        print("  symptom_concepts.py closed the ordering gap and kept the")
        print("  vocabulary one — its own docstring says so. These need more")
        print("  TERMS in existing concepts, not a fourth combination, which")
        print("  is fenced and would be a new clinical claim.")

    print()
    print("-" * 74)
    print(" ⛔ CONTRACTIONS WRITTEN OUT IN FULL")
    print("-" * 74)
    lost, reassured = contraction_misses()
    print("  red flags that stop matching : %d" % len(lost))
    for row in lost:
        print("      %s" % row)
    print()
    print("  ⛔ of those, ANSWERED WITH REASSURANCE beside a minor complaint: %d"
          % len(reassured))
    for row in reassured:
        print("      %s" % row)
    if reassured:
        print()
        print("  The 2026-09-19 run counted the phrases. This is what they cost:")
        print("  a lost red flag alone falls to URGENT; beside a recognised")
        print("  minor complaint it falls to SELF_CARE. See FINDING 0.")

    print()
    print("-" * 74)
    print(" ⛔ A HYPHEN WHERE THE LIST HAS A SPACE")
    print("-" * 74)
    hyphenated = hyphen_misses()
    if hyphenated:
        print("  %d screened phrase(s) stop matching when hyphenated:" % len(hyphenated))
        for variant, canonical in hyphenated:
            print("      %-34s (but %r screens)" % (variant, canonical))
        print()
        print("  Mechanical and bounded, like the contractions above: treating")
        print("  a hyphen as a space in normalize_query closes it everywhere.")
        print("  ⛔ Misspellings — siezure, unconcious, sucidal — also miss and")
        print("     are NOT proposed as fixable: that class is unbounded and")
        print("     closing it means fuzzy matching, trading this layer's")
        print("     determinism for an unmeasured false-positive rate.")
    else:
        print("  None. A hyphen is folded before matching.")

    print()
    print("-" * 74)
    print(" ⛔ INVISIBLE CHARACTERS — 'chest pain' with one inserted")
    print("-" * 74)
    invisible = invisible_character_misses()
    if invisible:
        print("  %d character(s) stop it being screened at all:" % len(invisible))
        for name in invisible:
            print("      %s" % name)
        print()
        print("  All are Unicode category Cf (format), not whitespace, so")
        print("  normalize_query's `\\s+` collapse never touches them. A")
        print("  non-breaking space and a thin space ARE folded and do work.")
        print("  This is what pasting from a web page, a PDF or Word produces —")
        print("  the same origin as the glued-list bug normalize_query fixes.")
    else:
        print("  None. Every one is folded away before matching.")
    # ⛔ Always zero. This reports; it does not gate. A sweep of invented
    # phrasings must never be able to fail somebody's build, and a threshold
    # here would imply these numbers carry an authority they do not have.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
