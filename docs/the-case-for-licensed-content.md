# The measured case for licensing protocol content

Written 2026-09-21, from the sweeps in `docs/test-run-2026-09-20.md`.

`backend/app/core/protocol_content.py` already exists: built, gated, wired to
nothing, waiting on a content licence. `docs/triage.md` calls it "the actual
fix for 'every phrase here was written by a software engineer', which is an
**authorship problem that more phrases cannot solve**", and records that the
enquiry to Schmitt-Thompson "is a procurement decision, not an engineering
one."

This file is the evidence for making that decision, gathered in one place. It
argues no new engineering.

## Five lists, one failure, measured the same way

Every lexical list in this app was checked by running ordinary wordings
through it rather than by reading it. Every one was correct on the wordings it
was written from and blind to the neighbouring ones.

| list | what was measured | result |
|---|---|---|
| `_EMERGENCY_RULES` | 56 lay phrasings of existing categories | **41 missed (73%)**; stroke 0/5, bleeding 0/6, vision loss 0/4 |
| the same, beside a minor complaint | 280 combinations | **170 return SELF_CARE (61%)** |
| contractions written out | every phrase containing one | **8 lose their flag; 7 of those become SELF_CARE** |
| `symptom_concepts` lexicon | 10 descriptions of its own three combinations | **10 missed (100%)** |
| `dose_schedule.AS_NEEDED` | British PRN wording | missed → six alarms a day, **fixed** |
| `interpretation._DIAGNOSIS` / `_REASSURANCE` | 20 things a model might write | **14 passed (70%)**, **fixed** |

Two were fixable here. Three are fenced and remain open.

## What the numbers actually say

⛔ **Not that the phrase lists are badly written.** They are careful, annotated,
and each addition is justified. The failure is structural: a literal phrase
list matches the wordings somebody thought of, and a frightened person writes
the ones they did not.

⛔ **And not that more phrases would fix it.** That has been tried repeatedly
here — 2026-09-06, 09-07, 09-12, 09-14 each added phrasings after finding
misses, and this run found 41 more in a corpus none of those passes had seen.
`docs/triage.md` already states the ceiling plainly: **rule coverage is 59.5%**,
so four descriptions in ten are answered by the safe default rather than by
recognition.

The three sweeps above are what that 59.5% costs at the EMERGENT end.

## The distinction that matters for the decision

Three of this run's findings are **orthographic** — contractions, invisible
characters, hyphens. Those are cheap, need no clinician, and should be fixed
regardless of what happens with licensing. They make spellings the existing
lists already hold reachable.

The rest are **vocabulary**, and vocabulary is where a phrase list written by a
software engineer runs out. "Half my face has gone slack" is not a spelling of
anything in the stroke list; it is a different sentence, and knowing it belongs
to stroke is clinical knowledge.

That is the authorship problem, and it is the one `protocol_content.py` was
built for.

## What licensing would and would not buy

**Would:** phrasings chosen by people who have heard patients describe these
presentations, revised annually, with dispositions that state their own tier —
`protocol_content.py` already **requires** that rather than mapping one itself,
because "deciding that 'be seen within 24 hours' means URGENT is a clinical
judgement".

**Would not:** remove the need for clinical review of everything else. The tier
definitions, `followup.py`, `dose_schedule.py` and `PLAN_SYSTEM_PROMPT` are
still an engineer's construction, and the release blocker in `docs/triage.md`
is untouched by any content licence.

**Would not, either:** make the rule layer disappear. `reconcile()` is `max()` —
licensed content may escalate the rule tier and may never lower it. The phrase
lists stay as the floor.

## The honest counter-argument

A licence costs money and takes time, and the three orthographic fixes plus a
clinician's afternoon on `docs/proposed-red-flag-phrases.md` would close a
large fraction of the measured gap for neither.

That is a real alternative and it should be weighed. What it does not do is
change the shape of the problem: the next corpus somebody writes will find the
next 41 phrasings, and the phrase list will still be a phrase list. The
licensed set is the only option on the table where the vocabulary stops being
this repository's to guess.

⛔ **Nothing here is a clinical judgement, and nothing here lifts a release
blocker.** It is a measurement of how often the current instrument does not
recognise ordinary English, offered to a decision somebody else has to make.
