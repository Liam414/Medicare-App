"""
The model explaining the rule layer's answer, in plain words, to the person.

WHAT THIS IS FOR. The repository owner asked on 2026-09-19 for the model to be
half of this feature rather than an invisible upgrade: "half of it is the layer
and then half of it is the AI... maybe the AI interprets the layer and gives
further information on what the risk level the user is describing."

That is what this does, and the wording matters: it **interprets a tier that
has already been decided**. It is a reader, not a second opinion.

## ⛔ IT CANNOT CHANGE A TIER, BY CONSTRUCTION AND NOT BY INSTRUCTION

This runs *after* `triage.assess` has finished. It is handed the finished
`TriageResult` and returns prose. There is no tier field on what it returns,
nothing downstream reads a tier from it, and it is called from the API layer
with the response already assembled — so there is no path by which its output
could reach the reconciliation in `triage._reconcile`, which is still `max()`
over the rule layer and the classifying model.

⛔ **Never give this module a return value a caller could mistake for a tier**,
and never call it from inside `triage.py`. The whole reason it is safe to let a
model write freely here is that the number it is writing about is already
fixed.

## ⛔ IT IS NEVER CALLED ON AN EMERGENCY

`should_interpret` returns False for EMERGENT. Precedent and reason are the
same as the rule that stops MedlinePlus topics being attached to an EMERGENT
result: the only thing worth showing someone who may be having a stroke is how
to get help, and a model round trip would put two to ten seconds between them
and the dial button. An interpretation is a nicety; 911 is not.

## ⛔ WHAT IT MAY NOT SAY

It is app-authored text about somebody's health, which is the most constrained
kind of writing in this repository. The prompt forbids naming a condition,
forbids a treatment, and forbids arguing for a different urgency than the one
it was given. `_is_safe` then checks the answer rather than trusting it:

- a reassurance phrase under a non-SELF_CARE tier is dropped, which is the
  deterministic half of property 4 ("the displayed reasoning never argues for a
  lower tier than the one shown");
- a diagnosis phrase is dropped at any tier.

⛔ A check is not a guarantee. It is lexical, and a model can say something
unsafe in words no list holds — the same limit the goals prompt has. What
bounds the damage is that this is *commentary beside a tier the rules already
set*, never the tier itself. **No clinician has read this prompt.** It belongs
in the same review as `SYSTEM_PROMPT`, `followup.py` and `PLAN_SYSTEM_PROMPT`.

## Failure is silence, never a blank space where a tier was

Every failure path returns `None` and the screen renders exactly what it
rendered before this module existed. A missing key, a dead endpoint, a refused
answer and a rejected answer are indistinguishable to the person, and all four
leave the reviewed reasoning in place. That is the same rule as a model outage
in triage never producing SELF_CARE.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.core.triage import TriageResult
from app.services import llm

logger = logging.getLogger(__name__)

# Enough for a short paragraph and no more. A long answer is an answer that has
# started explaining the person's illness to them, which is the line this must
# not cross — the same reasoning as MAX_DETAIL_CHARS in goal_structuring.
MAX_INTERPRETATION_CHARS = 700
MAX_RESPONSE_TOKENS = 320


SYSTEM_PROMPT = """You explain a triage result to the person who wrote the \
description. A separate, reviewed, deterministic rule layer has ALREADY \
decided how soon they may need to be seen. Your job is to help them \
understand that answer. It is not to form your own.

You are given: what they wrote, the urgency level that was decided, and which \
named screening rules recognised their words (sometimes none).

WRITE:
- Two or three short sentences, plain language, second person.
- Say what in their own description the screening responded to, or say plainly \
that nothing specific was recognised and that this is why the cautious answer \
was given.
- Say what the urgency level means in practical terms: roughly how soon, and \
what kind of place to go.

NEVER:
- Never name a condition, illness or diagnosis, or say what might be causing \
it. Not even as a possibility, and not even to rule one out.
- Never recommend a treatment, a medicine, a dose, or a home remedy.
- Never argue for more or less urgency than the level you were given, and \
never say the level is too cautious or not cautious enough.
- Never promise anything will be fine, and never tell them not to worry.
- Never invent a detail they did not write.

Write only the explanation. No preamble, no heading, no list."""


# ⛔ Dropped under a tier above SELF_CARE. These are the shapes an answer takes
# when it has started talking the urgency down, which is the one direction this
# app's whole safety design forbids.
_REASSURANCE = re.compile(
    r"\bnothing to worry about\b|\bdon'?t worry\b|\bdo not worry\b"
    # "no need to", "don't need to", "do not need to", "needn't" - each ends
    # "...be seen", the exact sentence this must never carry above SELF_CARE.
    # The first version had only "no need to", and a test caught the gap.
    r"|\b(no need to|don'?t need to|do not need to|needn'?t)\b"
    r"|\bprobably (fine|nothing|harmless)\b|\bnot serious\b|\bnot urgent\b"
    r"|\bshould settle\b|\bwill pass\b|\bno cause for concern\b|\bwait and see\b"
    r"|\bno rush\b|\bnot necessary to\b"
    # ⛔ ADDED 2026-09-20. The list above was written from three example
    # sentences and held exactly those; six ordinary ways of saying the same
    # thing walked through it. "It can safely wait" printed beside "get this
    # seen soon" is the property-4 violation this check exists to prevent, in
    # words the list did not carry.
    #
    # `(probably|likely|possibly|most likely) (fine|nothing|harmless|ok|okay)`
    # generalises the `probably (fine|nothing|harmless)` above rather than
    # sitting beside it.
    r"|\b(probably|likely|possibly|most likely) (fine|nothing|harmless|ok|okay)\b"
    r"|\bshould be (fine|ok|okay)\b|\byou'?ll be (fine|ok|okay)\b"
    r"|\bnot (to be|be) (concerned|worried|alarmed)\b"
    r"|\bclear up on its own\b|\bgo away on its own\b|\bresolve on its own\b"
    r"|\bno hurry\b|\bno urgency\b|\bcan wait\b|\bsafely wait\b"
    r"|\bnothing serious\b|\bnothing alarming\b|\bnothing dangerous\b",
    re.I,
)


# ⛔ Dropped at ANY tier. Naming a condition is the thing this app may never do,
# and it is worse here than anywhere else because it would appear beside a
# number that looks like a clinical finding.
_DIAGNOSIS = re.compile(
    r"\byou (probably |possibly |may |might |likely )?have\b"
    r"|\bthis (is|could be|may be|might be|sounds like) (a|an|the)\b"
    r"|\bconsistent with\b|\bsuggestive of\b|\bdiagnos"
    # ⛔ ADDED 2026-09-20. Eight more ways to name a condition, found by
    # writing what a model would plausibly say rather than what the pattern
    # already held. The three cases the original was written from passed and
    # proved nothing about the shape of the rule.
    #
    # `sounds like (a|an|the)` required an article, so "Sounds like flu to me"
    # walked through on a missing word — hence the article-free alternatives
    # below.
    r"|\b(looks|sounds|seems) like\b"
    r"|\b(typical|characteristic|indicative) of\b"
    r"|\bclassic (signs?|symptoms?|presentation) of\b"
    r"|\b(may|might|could) well be\b"
    r"|\boften have\b|\busually have\b"
    r"|\bpoints to\b|\bpointing to\b"
    r"|\b(likely|probable|possible) cause\b"
    r"|\bcaused by\b",
    re.I,
)


@dataclass(frozen=True)
class Interpretation:
    """
    ⛔ Prose and provenance. No tier, no score, no confidence — deliberately
    nothing a caller could read as a second opinion about urgency.
    """

    text: str
    model_id: str


def should_interpret(result: TriageResult) -> bool:
    """
    ⛔ Never on an emergency. See the module docstring: guidance to call 911
    must not wait behind a model round trip.
    """
    return result.tier.wire_value != "EMERGENT"


def _is_safe(text: str, tier: str) -> str | None:
    """The answer, or None with the reason logged. Never the value itself."""
    stripped = text.strip()
    if not stripped:
        return None
    if len(stripped) > MAX_INTERPRETATION_CHARS:
        logger.info("interpretation discarded: longer than the cap")
        return None
    if _DIAGNOSIS.search(stripped):
        logger.info("interpretation discarded: named a condition")
        return None
    if tier != "SELF_CARE" and _REASSURANCE.search(stripped):
        logger.info("interpretation discarded: reassured under a %s tier", tier)
        return None
    return stripped


def _rules_line(result: TriageResult) -> str:
    if result.rules_defaulted or not result.rule_ids:
        return (
            "No named screening rule recognised anything in the description. "
            "The cautious default was applied for that reason."
        )
    return "Screening rules that recognised the description: " + ", ".join(
        sorted(result.rule_ids)
    )


def interpret(description: str, result: TriageResult) -> Interpretation | None:
    """
    A short explanation of `result`, or None.

    ⛔ Returning None is an ordinary outcome, not an error to surface. The
    caller renders the reviewed reasoning it already has.
    """
    if not should_interpret(result):
        return None

    endpoint = llm.default_endpoint()
    if not llm.configured(endpoint):
        return None

    tier = result.tier.wire_value
    prompt = (
        f"What they wrote:\n{description}\n\n"
        f"Urgency level decided: {tier}\n"
        f"{_rules_line(result)}\n\n"
        "Explain this to them."
    )

    try:
        reply = llm.chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            endpoint=endpoint,
            temperature=0,
        )
    except llm.LLMUnavailable as exc:
        # ⛔ A type and nothing else. A provider's error body can quote the
        # request, which here is the person's own description.
        logger.info("interpretation unavailable: %s", type(exc).__name__)
        return None
    except Exception as exc:  # noqa: BLE001 - never break an assessment
        logger.info("interpretation failed: %s", type(exc).__name__)
        return None

    safe = _is_safe(reply.text or "", tier)
    if safe is None:
        return None
    # The model the provider actually answered with, not the one we asked for.
    return Interpretation(text=safe, model_id=reply.model_id or endpoint.model)
