# The symptom picker

A dropdown that suggests lay symptom phrases while somebody describes what is
wrong, collects the ones they pick into a list, and sends that list alongside
their own words to the existing urgency classifier.

Built 2026-09-16 at the repository owner's direct request and with their
explicit approval, recorded in CLAUDE.md. **This file is the reasoning; the
rules in CLAUDE.md are what bind.**

## ⛔ What this feature is, stated honestly

It makes MedHelp the author of a clinical vocabulary. The repository had
refused that twice before, in writing:

- the emergency card has no picker of conditions or allergies, because
  "offering a menu of conditions would make MedHelp the author of a clinical
  vocabulary";
- MedlinePlus reading material is gated off entirely, because a topic rendered
  under someone's own description reads as a suggested diagnosis.

The owner was shown both precedents and the release blocker on symptom intake,
and asked for it anyway, reachable by default rather than behind a flag. That
is their call to make. It does not lift the release blocker, and **no clinician
has read a word of the vocabulary.**

## The four rules the vocabulary is built on

In `mobile/src/services/symptomVocabulary.ts`, each asserted by
`mobile/__tests__/symptomVocabulary.test.ts`.

### 1. Symptoms only, never conditions

"chest tightness" is a thing a person feels; "angina" is a conclusion a
clinician reaches. A menu naming conditions would have the user pick the
disease they believe they have, which is the app diagnosing by proxy — the
first thing App Scope forbids. `test_names_no_condition_or_diagnosis` checks a
list of disease names against every label and synonym, on word boundaries.

### 2. No severity is attached to any entry

⛔ **The load-bearing rule.** A symptom displayed as "mild" is reassurance
MedHelp authored, and the triage design rests on the property that neither
layer may *lower* a tier. Urgency is decided once, downstream, by the
classifier reading the whole description.

The test pins the entire field set — `area`, `id`, `label`, `synonyms` — so a
`severity` field cannot be added without deleting an assertion that says why
not. The picker's own test separately asserts that no tier word, no
seriousness word and no "Call 911" string ever renders inside it.

This is the part of the owner's request that was **not** built as asked.
"Align with the three levels of severity" was implemented as *the assembled
list is classified into one of the three tiers by the existing classifier* —
not as *each symptom carries a severity label*. The second reading would be a
per-symptom clinical claim and would invert the one-directional safety
property. It remains available as a separate, explicit decision.

### 3. Relatedness is anatomical, never clinical

`area` groups phrases by the part of the body a person would say they are
about. It does **not** say which symptoms occur together.

This distinction is the whole reason the "other things people describe"
list is permissible. Suggesting "pain spreading to my arm" to somebody who
typed "chest pain" would be prompting for a cardiac red flag — a screening
question wearing the clothes of an autocomplete, and an instrument no clinician
has reviewed. `test_never_offers_something_from_an_unrelated_area` asserts the
suggestion set never leaves the area.

The UI heading says so in as many words: *"Other things people describe about
the ears, nose and throat"*, with *"Listed because they are about the same part
of the body, not because MedHelp thinks they are connected to yours."* A test
asserts both strings, and asserts the absence of "related to your", "you may
also have" and "commonly occurs with".

### 4. The list is never ranked by seriousness

Matches come back in the vocabulary's own order, which is alphabetical within
an area. Ordering symptoms by how alarming they are would be the clinical
judgement rule 2 forbids — the same rule that stops the app reordering
MedlinePlus topics or ranking providers by anything but distance.

## It runs on the device, and that was a data-handling decision

No endpoint, no network call, no model.

A partially typed symptom is health text. CLAUDE.md requires intake text to
reach the backend by POST "never as a URL query string, so it stays out of our
access logs, proxies, and crash reporters" — and an autocomplete is the
canonical shape of a GET with the user's text in the query. Matching on the
device means the text does not reach the backend at all until the user
submits, so there is no new transmission and no new BAA question. Same
reasoning that put label OCR on-device.

The cost is that a reviewer reading the backend will not find the vocabulary;
it is in the mobile bundle. That is stated in CLAUDE.md so the clinical review
covers it.

**The phrases travel, not ids.** Resolving ids server-side would mean a second
copy of a clinical vocabulary in the backend, and two copies drift — one would
eventually offer a phrase the other had removed. The server treats what it
receives as what it is: plain text the user endorsed.

## ⛔ The separator is a safety property, not formatting

`merge_selected_symptoms` in `backend/app/api/intake.py` joins picked phrases
into the description with `". "`, the same separator `followup.merge` uses.

Every phrase in `emergency.py` and `rules_triage.py` is compiled with word
boundaries, so two phrases run together match **nothing**. This repository has
already shipped that bug: a pasted list arriving as
`"Chest painShortness of breath"` was screened as neither and fell to the
URGENT default instead of EMERGENT. `normalize_query` splits a
lowercase-to-uppercase boundary afterwards and would catch that particular
shape, but it cannot catch `"a feverchills"` — and a feature whose entire job
is to assemble a list must not be the thing that manufactures the glue.

`backend/tests/test_selected_symptoms.py` asserts the separator, and then
asserts the thing the separator is for: a picked red-flag phrase still reaches
`screen_for_emergency`, and a picked combination reaches the same tier as the
same words typed by hand.

## A picked phrase carries the same weight as a typed one

That is intended — the list exists so somebody does not have to think of the
word themselves — and it is the property `followup.merge` already relies on.

It is also **why rule 3 matters so much**. CLAUDE.md already flags that the
follow-up questions can manufacture an escalation, because round two offers
"Suddenly" as a choice and `_ESCALATING_MODIFIERS` contains it, and says a
reviewer should decide whether an answer the app offered should weigh the same
as a phrase the user volunteered. The picker is that question at full size. The
anatomical-only constraint is what stops it becoming a red-flag prompt.

**A reviewer should rule on this specifically.**

## What the screen promises, and the sentence that had to change

The hint under the symptom field used to read:

> Your own words. Nothing here is rewritten before it is assessed.

That was true of a screen whose only input was prose the user typed. It stopped
being true the moment MedHelp began offering phrases of its own. It now reads:

> Your own words — what you type is never rewritten. Anything you add from the
> list below is shown separately, and you can remove it.

Both halves are true and both are asserted: the typed description is never
altered, and every app-contributed phrase is a visible chip the user can
remove. ⛔ A second test pins the *old* sentence as forbidden, so a revert fails
rather than quietly restoring a claim the picker disproves.

This is user-facing copy on the intake screen, so it belongs in the clinical
reviewer's read of that screen — the same standing as the URGENT hand-off and
the consent checkbox.

## The picker cannot stand in for a description

A picked symptom is not a substitute for writing something. Submitting with an
empty description is refused even when phrases are selected: the list is an aid
to someone already writing, not a form to fill in instead, and a bag of
app-authored phrases with nothing of the person's own in it is not a
description. The follow-up questions, which are what recover detail when the
rules recognise nothing, are written to elicit prose rather than tags.

## One chip component, because the accessibility rule is enforceable that way

The first draft had two chip elements — one for an added phrase, one for an
offered phrase — each with its state hard-coded into its own label. Correct
output, unsafe shape, and `accessibleState.test.ts` caught it.

That guard reads each call site and asks whether the label *can* differ between
states. Two fixed labels in two places cannot, so nothing would tell the next
person that the state has to be spoken at all. With one `SymptomChip` taking an
`added` boolean, the label always says which state it is in and the guard can
see that it varies. `accessibilityState` is kept beside it because it is right
on native; React Native Web never reads it, which is exactly why the words are
in the label.

⛔ The fix was **not** to add the file to `EXEMPT`, and must never be. That list
is for call sites where the state genuinely reaches the DOM another way.

## Not reviewed, and PHI status

- **Not reviewed by a clinician.** The vocabulary, the area groupings, and the
  decision to offer neighbouring phrases at all are a software engineer's
  construction, the same standing as the phrase lists in `rules_triage.py`,
  `dose_schedule.py` and `followup.py`. It belongs in the same review, and it
  is now the largest single body of app-authored clinical language in the app.
- Picked phrases are merged into the description and stored on
  `intake_assessments` under the existing consent checkbox. That column is
  **not encrypted at rest**, the same open finding as the rest of the table.
- Nothing about the picker is transmitted anywhere on its own. It contributes
  text to a request the user was already making.
