# The symptom picker

A list of lay symptom phrases somebody can search by typing or browse by body
area, which collects what they pick and sends it to the existing urgency
classifier — alongside their own words, or instead of them.

Built 2026-09-16 at the repository owner's direct request and with their
explicit approval, recorded in CLAUDE.md. **This file is the reasoning; the
rules in CLAUDE.md are what bind.**

> **Updated 2026-09-17**, again at the owner's request: typing became optional,
> browsing was added, and the vocabulary went from 69 phrases to 202. Two
> things in the original design were *reversed* rather than extended — the
> requirement to type, and the sentence below describing the list as "an aid to
> someone who is already writing". Both are recorded in CLAUDE.md under
> "Typing is optional, and the list is browsable".
>
> That update also found **ten phrases the picker offered that emergency
> screening could not read at all**, seven of them already shipped. The fix and
> the guard that stops them returning — `scripts/check_picker_coverage.py`,
> which parses this TypeScript from Python precisely because nothing else could
> see both halves of the seam — are described there too. If you read only one
> thing from that update, read that part.

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


---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### The symptom picker (implemented 2026-09-16)


A dropdown suggests lay symptom phrases while somebody types, collects the ones
they pick into a list, and sends that list alongside their own words to the
existing classifier. Full reasoning: `docs/symptom-picker.md`.

⛔ **THIS MAKES MEDHELP THE AUTHOR OF A CLINICAL VOCABULARY**, which this file
refuses twice elsewhere — the emergency card has no picker of conditions for
exactly this reason, and MedlinePlus reading is gated off because content shown
under someone's description reads as a suggested diagnosis. The repository
owner asked for it in conversation on **2026-09-16**, was shown both precedents
and the standing release blocker, and chose to have it reachable by default
rather than behind a flag. That is the approval this rests on, and this
paragraph is the record of it, not the authorisation. **No clinician has read
the vocabulary**, which is now the largest body of app-authored clinical
language in the app, and it belongs in the same review as `followup.py` and
`dose_schedule.py`.

Four rules, in `mobile/src/services/symptomVocabulary.ts`, each tested:

1. ⛔ **Symptoms only, never conditions.** A menu naming diseases would have
   the user pick the one they think they have — the app diagnosing by proxy.
2. ⛔ **No severity on any entry, ever.** A symptom shown as "mild" is
   app-authored reassurance and would invert the rule that nothing may lower a
   tier. The whole field set is pinned by a test so one cannot be added
   quietly. Urgency is decided once, downstream, from the whole description.
3. ⛔ **Relatedness is anatomical, never clinical.** `area` says which part of
   the body a phrase is about; it never says which symptoms occur together.
   Suggesting "pain spreading to my arm" to someone who typed "chest pain"
   would be prompting for a red flag — a screening question dressed as an
   autocomplete. The heading must keep saying the list is about a body area and
   not a connection MedHelp has inferred.
4. ⛔ **Never ranked by seriousness.** Vocabulary order only — the same rule
   that stops the app reordering MedlinePlus topics or ranking providers.

⛔ **It runs on the device and makes no network call.** A partially typed
symptom is health text, and an autocomplete is the canonical shape of a GET
with the user's text in a query string — which this file forbids for intake.
The consequence is that the vocabulary lives in the mobile bundle rather than
the backend, so a clinical reviewer has to be pointed at it.

⛔ **Picked phrases are joined with a separator, and that is a safety
property.** `merge_selected_symptoms` in `app/api/intake.py` uses ". ", because
phrases run together match no word-boundary rule at all — the glued-list bug
this file already records. A feature whose job is to assemble a list must not
manufacture the glue. Tests assert the separator, and that a picked red-flag
phrase still reaches emergency screening.

⛔ **A picked phrase escalates exactly as a typed one does**, which is intended
and is why rule 3 matters. This is the "follow-up questions can manufacture an
escalation" problem at full size, and a reviewer should rule on it directly.

⛔ **"Align with the three levels of severity" was built as the assembled list
being classified into one of the three tiers, not as a severity per symptom.**
The second reading is a per-symptom clinical claim and was deliberately not
built; it is a separate decision, not an oversight.

The hint under the symptom field changed and ⛔ **the old wording must not come
back**: "Nothing here is rewritten before it is assessed" became false once the
app began offering phrases of its own. A test pins the old sentence as
forbidden. It is copy on the intake screen, so it belongs in the clinical
reviewer's read of that screen.

### Typing is optional, and the list is browsable (2026-09-17)

Two changes, asked for together by the repository owner in conversation on
**2026-09-17**: that a person be able to get an estimate without typing
anything — "you can only use that if you want to" — and that the vocabulary
cover more than the basics.

#### ⛔ This reversed a decision the picker shipped with. Read both sides.

`handleSubmit` refused an empty description, and the comment saying so was not
an oversight — it read *"a picked symptom is not a substitute for a
description. The list is an aid to someone who is already writing, not a form
to fill in instead."* `IntakeRequest.description` was `min_length=1` to match.

That is now reversed: either input is enough. The owner's reasoning is the
record — somebody who is unwell should not have to write prose to be heard,
and a list you can only use while already typing is not a way in for the
person who cannot easily type at all.

**What the old comment got right, and what had to be handled rather than waved
away:** the follow-up questions are written to elicit prose. A tap-only
submission the rules do not recognise still lands on a questionnaire asking
where it is and how long it has been going on. That works — those questions are
answerable by somebody who never typed anything, and two of the four are
already multiple choice — but it is why this is a reversal with a consequence
rather than a free one, and a reviewer should read it that way.

⛔ **The floor moved; it did not disappear.** A submission with neither typed
text nor a picked phrase is still refused, in the client and again in
`IntakeRequest._at_least_one_input`. Estimating urgency from nothing returns
the safe default with no basis of any kind under it, and a tier nobody
described is worse than an error. The validator's message quotes no value, for
the same reason `app/main.py` strips them.

#### Browsing, which is the half that is not the submit button

`matchSymptoms` needs three characters before it offers anything, so an empty
screen showed nothing and the picker rendered `null`. Reaching the vocabulary
required writing — precisely what the person this was built for does not want
to do. `symptomsInArea` and `browsableAreas` now back an "Or pick from a list"
block: twenty body areas, one open at a time.

- ⛔ **`AREAS_IN_BROWSE_ORDER` is not a ranking and must never become one.**
  Rule 4 forbids ordering by seriousness and an ordered list of body areas is
  the easiest place to break it by accident — putting "chest" first because
  chest symptoms are frightening is exactly that judgement. It runs head
  downwards, then whole-person, then the areas defined by who you are.
- **Browsing is uncapped** where matching is capped at eight. Matching answers
  a half-typed word; browsing answers "show me everything about my chest", and
  truncating that hides phrases from the one person who came looking for them.
- The area buttons say open or closed **in the accessible label**, not only in
  `accessibilityState` — the React Native Web rule this file records twice
  already.

#### The vocabulary went from 69 phrases to 202

Six new areas: mouth and teeth, bowels, periods and women's health, men's
health, pregnancy, babies and children, injuries and accidents, medicines.
Existing areas roughly doubled, and the additions are weighted toward the
presentations the old list had no words for — advanced, serious and
life-stage-specific rather than more ways to say "headache".

⛔ **It is still symptoms only.** Rule 1 stands and `names no condition or
diagnosis` still passes: no entry names a disease. The owner asked for "more
advanced diseases and stuff of that nature", and what was built is the
symptom-side reading of that — a person can now say *"sudden vision loss"*,
*"black tarry stools"*, *"my baby is very sleepy and hard to wake"*, none of
which the old list could express. **Naming conditions was deliberately not
done** and is a separate decision — see the open question below.

#### ⛔ Ten phrases the picker offered could not be screened at all

The change that matters most, and it was not part of either request.

The vocabulary is TypeScript in the mobile bundle; the screening is Python in
`emergency.py`. **Nothing could see both halves at once**, so the app could
offer somebody a phrase and then read it as nothing. That was true of ten
entries, **seven of them already shipped**:

| Offered | Screened as |
|---|---|
| "the worst headache I have ever had" | nothing |
| "slurred or muddled speech" | nothing |
| "pain spreading to my arm, neck or jaw" | nothing |
| "my throat feels like it is closing" | nothing |
| "trouble finding words" | nothing |
| "swelling of my face, lips or tongue" | nothing |
| "I have taken too many pills" | nothing |

All ten are the same defect the 10,000-case corpus found in the rules
themselves: the phrase is a paraphrase of the literal. "slurred speech" screens
and "slurred or muddled speech" does not; "worst headache of my life" screens
and "the worst headache I have ever had" does not.

⛔ **A phrase MedHelp offers and then cannot read is worse than one it never
offered.** The person tapped the app's own words and got less than if they had
typed their own, and nothing told them so.

**Fixed by rewording the labels**, not by touching the phrase lists — the
labels are this feature's own UI copy, so no fenced module changed. Compound
labels were also split ("my lips are swelling" and "my tongue is swelling" as
separate entries), which rule 3 wanted anyway: a compound label asserts that
two things go together.

`backend/scripts/check_picker_coverage.py` is what found them and what stops
them coming back. It parses the TypeScript and runs every label through the
real rule layer:

    cd backend
    python scripts/check_picker_coverage.py --strict
    python scripts/check_picker_coverage.py --defaults

⛔ **Its expectations are keyed on entry id, never on the label.** Keying on
the label would mean a reword silently dropped the check — and rewording is
the edit that caused this. `tests/test_picker_coverage.py` runs it in the
suite. Parsing TypeScript from Python is ugly; a second copy of the vocabulary
in Python would be worse, for the reason this file already gives about two
copies drifting.

#### What a reviewer should be told, and one open decision

- **Rule coverage is 25.7%** — of the 202 phrases offered, 52 are recognised by
  a named rule and 150 fall to the URGENT default. So a tap-only submission
  usually returns URGENT, and only 6 phrases can earn SELF_CARE on their own.
  That is the designed behaviour ("not recognised is not the same as
  harmless"), and it is also the ceiling CLAUDE.md already names. **Raising it
  means adding to the self-care list, which lowers tiers, which is a separate
  approval and a clinician's read.**
- ⛔ **OPEN: should the picker name conditions?** The owner asked for "more
  advanced diseases". Rule 1 forbids it and the tested reason is good — a menu
  of diseases has the user pick the one they think they have, which is the app
  diagnosing by proxy, and it is the same reason the emergency card has no
  condition picker. Symptoms were expanded instead. **If conditions are wanted,
  that is a decision to take deliberately against rule 1, not an edit**, and it
  needs the clinician who has not yet read any of this.
- Nothing here is clinician-reviewed. The vocabulary is now **202 phrases of
  app-authored clinical language**, up from 69, and it remains the largest such
  body in the app.



## Body areas became a menu, and stopped looking like symptoms (2026-09-19)

Reported by the repository owner from playtesting: the picker was "a little
confusing on what is happening... there's like so much... and the head, eyes,
and those categories are like right in with the symptoms, so it just makes it
very complex and confusing."

Two defects, both in `SymptomPicker.tsx`, **neither in the vocabulary**:

- **An area was drawn as the same pill as a symptom.** The twenty body areas
  used `styles.chip` — the same border, radius, padding and wrapping row as a
  symptom phrase. So "head" and "eyes" sat among "a pounding headache" looking
  like things you could add, and there was no visual rank between a place to
  look and a thing to say.
- **Opening an area did not put you anywhere.** The other nineteen buttons
  stayed on screen and the phrases appeared underneath them, so a person who
  tapped "chest" read its phrases in the middle of the menu they had just
  used.

**Areas are now full-width rows in a bordered list** — label, count, chevron —
which is a menu and cannot be mistaken for a chip. **Opening one replaces the
menu** with that area's phrases behind a back row reading `‹ head … All areas`.

⛔ **Nothing was removed.** The same twenty areas and the same 202 phrases are
reachable in the same number of taps; matching, related phrases, the added
list and the typing path are untouched; and all four vocabulary rules still
hold — no ordering, no severity, no condition, and `AREAS_IN_BROWSE_ORDER` is
still not a ranking. No backend module, no copy on a fenced screen, and no
disclaimer changed.

⛔ **`AreaRow` is one component with a varying label, not two components with a
fixed label each.** The first draft rendered the closed row and the open
header separately, which is correct output and an unsafe shape —
`accessibleState.test.ts` failed it, because two fixed labels in two places
cannot be seen to vary and nothing would tell the next person that the open
state has to be spoken. Same rule, and the same reason, as `SymptomChip`. See
`docs/accessibility.md`.

`test_replaces_the_list_of_areas_with_the_one_that_was_opened` pins the
drill-down. "switches areas rather than stacking them open" was rewritten to
go back to the menu first — the invariant it protects, that two areas are
never open at once, now holds by construction rather than by assertion.
