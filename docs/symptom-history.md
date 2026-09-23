# Symptom history and the visit summary

Added 2026-09-22. `GET /intake` and `DELETE /intake/{id}` in
`backend/app/api/intake.py`; `SymptomHistoryScreen`, `VisitSummaryScreen` and
`mobile/src/services/visitSummary.ts` on the client. Reached from the Symptoms
tab (a rail entry on wide windows, a button at the foot of the intake screen
on a phone).

## Why it exists

The audit of 2026-09-22 found assessments were already being stored, with
consent, in `intake_assessments` — and nothing ever read them back. The data a
person most wants to take to an appointment ("what did I say last Tuesday?")
was in the database and unreachable by them.

## A receipt, never an interpretation

Each history row is what the person was shown at the time: their words, the
tier, and the reasoning. It is **never re-assessed** against today's rules.
The phrase lists change; a row re-run through them could come back with a
different tier, and presenting that as the answer they were given would be
worse than having no history at all.

There is no trend, no count, and no grouping. "You have described headaches
three times this month" sounds like a helpful observation and is a clinical
one — it asserts that three descriptions are the same complaint and that the
repetition means something. A test asserts no such text appears.

## The summary is verbatim

`buildVisitSummary` assembles plain text from:

- each chosen assessment's stored description, in quotation marks;
- the follow-up recap, rebuilt with `followup.summarise` from the stored
  answers — a fixed label beside the person's own text;
- the tier label they were already shown, prefixed "MedHelp's urgency
  estimate";
- each medication's name, dose and directions, the directions in quotation
  marks exactly as entered or scanned.

MedHelp adds fixed headings and one preamble sentence saying the estimates are
not diagnoses and nothing has been reviewed by a clinician. It adds nothing
else. Directions are never decoded — "TAKE 1 TABLET BY MOUTH TWICE DAILY" is
not turned into "twice a day", for the same reason the label scanner does not
expand BID.

Deliberately left out: notes (free text written for the person, not for a
clinician, and the likeliest place for something they would not want shared),
the prescriber, refill dates and supply estimates.

An empty medication list prints "None recorded in MedHelp." rather than
dropping the section, the same principle as "Not provided" on the emergency
card: a missing section reads as "takes nothing".

History is printed oldest first, because a clinician reads a history forwards.

## What leaves the device, and how

Nothing is uploaded to make a summary. It is built on the device from data the
app has already loaded, previewed in full as the exact text that will be
shared, and handed to the platform share sheet (`Share.share`). On a browser
with no share sheet it falls back to the clipboard, and the screen says
"Copied" rather than "Shared". A dismissed sheet reports nothing — the screen
never claims something was sent when it was not.

Once shared, the text has left MedHelp. That is the point of it, and the
person chose the recipient.

## Consent

Only assessments stored with consent exist to be listed. The consent sentence
on the intake screen used to say storage was for MedHelp's accuracy review
only. It now also says saved descriptions appear under Past descriptions and
can be removed there, because consent has to describe what it is consent to.
That sentence is intake-screen copy and belongs in the clinical reviewer's read
of that screen.

Deletion is a hard delete of the row. Another user's id returns 404, never
403, so the endpoint does not confirm that an id exists.

## What the read-back does not include

`rule_ids`, `model_tier`, `model_confidence`, `rules_defaulted` and
`user_reported_wrong` are audit fields for a reviewer. They are not in
`IntakeHistoryItemOut`, and a test asserts the exact field set. A patient shown
"the rules said URGENT, the model said SELF_CARE" would reasonably read the
second as a second opinion, which it is not.

## PHI status

Nothing new is stored. The existing `intake_assessments` rows are now
readable by the person they belong to, which is the least surprising place
for them to be readable. The same open finding applies: not encrypted at rest.
