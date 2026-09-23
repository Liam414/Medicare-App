"""
What the health profile adds to an urgency estimate. Owner decision 1,
approved 2026-09-22: triage considers conditions and allergies, and the
profile may ONLY EVER RAISE a tier.

Three floors, each readable in one line, each lexical over the person's own
words — no clinical vocabulary is authored here:

1. The description names something on the person's own allergy list
   -> at least URGENT.
2. They answered "Yes" to "could you have been in contact with anything on
   your allergy list?" -> at least URGENT; "not sure" -> at least
   CLINICIAN_SOON (when unsure, higher).
3. They have any recorded condition and the estimate was SELF_CARE
   -> CLINICIAN_SOON. Self-care is not earned on a phrase list for someone
   with a long-term condition nobody has reviewed alongside it.

⛔ `apply` returns max(tier, floor). There is no path here that lowers a tier,
and a test asserts it for every tier and every floor.

⛔ Not clinically reviewed. Rule 3 in particular over-triages (a recorded
"hay fever" blocks self-care for a cold). That is the intended direction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.triage import Tier

# Words too common to count as "naming an allergen" on their own.
_STOPWORDS = frozenset(
    "a an and or the to of in on with for from my me i allergy allergic "
    "allergies reaction severe mild some any all".split()
)
_WORD = re.compile(r"[a-z]+")

NOTE_ALLERGEN = (
    " You mentioned something that is on your allergy list, so MedHelp "
    "suggests being seen soon rather than waiting."
)
NOTE_ALLERGEN_UNSURE = (
    " You weren't sure whether you had been in contact with something on your "
    "allergy list, so MedHelp suggests seeing a clinician in the next few days."
)
NOTE_CONDITION = (
    " Your health profile lists a long-term condition, so MedHelp suggests "
    "having this looked at by a clinician in the next few days rather than "
    "managing it on your own."
)


@dataclass(frozen=True)
class ProfileContext:
    conditions: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()
    # The answer to followup.ALLERGY_CONTACT, verbatim ("" when not asked).
    allergy_contact: str = ""


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if len(w) >= 3 and w not in _STOPWORDS}


def _stem(word: str) -> str:
    # A trailing "s" either way: "peanut" on the list, "peanuts" in the text.
    return word[:-1] if word.endswith("s") else word


def names_an_allergen(description: str, allergies: tuple[str, ...]) -> bool:
    words = {_stem(w) for w in _tokens(description)}
    return any(_stem(token) in words for entry in allergies for token in _tokens(entry))


def apply(tier: Tier, description: str, profile: ProfileContext | None) -> tuple[Tier, list[str], str]:
    """(tier, rule ids that raised it, sentence to append to the reasoning)."""
    if profile is None:
        return tier, [], ""

    floor, ids, note = Tier.SELF_CARE, [], ""
    contact = profile.allergy_contact.strip().lower()

    if names_an_allergen(description, profile.allergies):
        floor, note = Tier.URGENT, NOTE_ALLERGEN
        ids.append("profile:allergen_named")
    if contact == "yes":
        floor, note = Tier.URGENT, NOTE_ALLERGEN
        ids.append("profile:allergen_contact")
    elif contact in {"i'm not sure", "not sure"} and floor < Tier.CLINICIAN_SOON:
        floor, note = Tier.CLINICIAN_SOON, NOTE_ALLERGEN_UNSURE
        ids.append("profile:allergen_contact_unsure")
    if profile.conditions and tier == Tier.SELF_CARE and floor < Tier.CLINICIAN_SOON:
        floor, note = Tier.CLINICIAN_SOON, NOTE_CONDITION
        ids.append("profile:condition_recorded")

    if floor <= tier:
        return tier, [], ""  # nothing raised, so nothing to explain
    return floor, ids, note
