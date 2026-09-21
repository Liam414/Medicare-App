# Symptom triage: the blocker, the architecture, and the history

Detail behind CLAUDE.md, sections "BLOCKING: symptom intake" and "Emergency routing". The release blocker and the fences are stated in CLAUDE.md and are binding; this file carries the reasoning, the measurement results, and the record of fixed and reported bugs.

## ⛔ BLOCKING: symptom intake requires clinical and legal sign-off

The symptom-intake feature (`backend/app/core/triage.py`) estimates how soon a
user should be seen — EMERGENT, URGENT, or SELF_CARE — from free text, using a
language model. **It must not be put in front of real users until both of the
following are signed off and recorded here.** This is a release blocker, not a
recommendation.

1. **A licensed clinician** must review the tier definitions, the system
   prompt, the deterministic red-flag lists, and a corpus of real
   classifications. Nothing in this feature was written or reviewed by a
   clinician; the tier boundaries are a software engineer's construction.
2. **Legal counsel** must determine whether this is a regulated medical
   device in each target market. Software that recommends time-critical care
   ("go to an ER now") from symptom input is materially different from
   reference content, and the earlier informational-only posture of this app
   does not cover it. Also unresolved: liability for an under-triage, and what
   the audit trail must retain.

Additional known limits a reviewer should be told about:

- The classifier still has **no clinically validated error profile**. Unlike an
  instrument such as ESI or Manchester Triage, nobody qualified has measured
  its under-triage rate. The architecture biases toward over-triage, which is
  the safer direction, but "biased safe" is not the same as "measured safe".
  - What *does* now exist is a **measurement harness**
    (`backend/scripts/triage_eval/`) and a regression ratchet in the suite.
    It measures the rule layer against gold tiers an engineer assigned from
    this file's own documented intent, so it catches regressions and quantifies
    coverage — and it is **not** the validation this bullet asks for. See
    "Triage is measured now" below, and "Ten thousand common illnesses" after
    it: two corpora, 122 and 10,000 cases, both now at 100% agreement with
    documented intent and 100% safety of advice. ⛔ **Those figures are
    consistency with an engineer's labels, not a measured under-triage rate.**
    A corpus cannot contain the phrasing nobody thought to write down, and
    the 59.5% rule coverage says plainly how much of this is still a phrase
    list rather than an understanding. This bullet stands unchanged.
- The audit trail exists (`intake_assessments`) but **nobody is reviewing it
  yet**. Logging classifications is only useful if someone qualified reads
  them; assign that owner.
- Intake descriptions are the most sensitive free text in the app and are
  **not yet encrypted at rest**.
- **The clarifying questions are in scope for the clinical review.** The
  prompts in `app/core/followup.py` are elicitation, not screening — no
  threshold, no hypothesis test — but which questions get asked shapes what
  the classifier sees, so a reviewer should read them as part of the
  instrument rather than as UI copy. The severity scale in particular is a
  number the app collects and does not act on; a reviewer should say whether
  that is right.

  There are now **two rounds**. Round one asks the questions the description
  has **not already answered** (`answered_by_description`): a person who wrote
  "my throat has been sore since yesterday" is not asked where it is or how
  long it has been going on. The tests are lexical and closed — a list of lay
  anatomy nouns, a list of time expressions, a list of intensity words — and
  they only ask whether ground has been covered, never what a symptom means.
  They are deliberately conservative, because a missed detection costs one
  redundant question while a false one loses information the classifier
  needed. Two properties hold, both tested: **associated symptoms are never
  skipped** (the answer cannot be inferred from what was written, and it is
  the net that catches an unmentioned symptom, so it also keeps the round
  non-empty), and **no round-two id ever appears in round one**, because
  `rounds_completed` reads the round off the answer keys and that is what caps
  asking server-side. Which questions get skipped is part of the instrument
  and needs the same review as the prompts. Round two is three
  questions: onset and course always, plus a third picked from a fixed list by
  a short chain over round one's answers (severity ≥ 8 → functional impact;
  brand new or "not sure" → whether it is constant; a week or more → whether
  it has happened before; otherwise → what has changed recently). The
  selection is deterministic — the same answers always produce the same
  questions — which is what makes it reviewable. **The selection rule is
  itself part of the instrument and needs the same review as the prompts.**
- **The model may now decline to classify** (`NEEDS_MORE_INFO`), which is not
  a fourth tier and cannot be ranked against one. It only adds a question; the
  rule tier stands underneath it, and asking is capped at `followup.MAX_ROUNDS`
  (two) after which the safe default (URGENT) is applied and stated plainly.
  A reviewer should confirm that two rounds is the right cap.
  - Asking also stops early if a round comes back with nothing usable — every
    answer blank or "I'm not sure". Someone who could not answer the first set
    will not do better with a second, and asking again would trap them.
  - **The cap is enforced server-side, from the answer ids**, not from a round
    number the client reports. The two question sets have disjoint ids, so a
    client cannot talk its way into a third round.
- **The result screen now shows a recap of the answers** (`summarise` in
  `followup.py`, rendered as "What you told us"). It is a receipt, not an
  interpretation: each row is a fixed field label beside the user's own text,
  verbatim. Nothing is combined, rephrased, categorised or reasoned about, and
  **no condition is ever named** — that is the line between this and the
  differential diagnosis the app must not produce. Answers of "I'm not sure"
  are reported as still unknown rather than as facts. It exists because
  "MedHelp could not confidently recognise what you described" is the same
  sentence every time, and naming what is still blank is the part that
  actually explains a cautious estimate.
- **`model_confidence` is recorded and never acted on.** LOW/MEDIUM/HIGH is
  stored on `intake_assessments` so a reviewer can ask whether the wrong calls
  are the low-confidence ones. It must not become an input to the tier without
  that review — a confidence threshold that softens a tier would invert the
  one-directional safety property the whole design rests on.

### How the safety architecture works

Two layers. **The rule layer is the product; the model is an optional
upgrade.** Read `backend/app/core/rules_triage.py` and
`backend/app/core/triage.py` before changing any of it.

**Layer 1 — rules (`rules_triage.py`). Always runs. No key, no network, no
cost.** Explicit phrase lists a clinician can read line by line, evaluated in
order: emergency red flags → urgent indicators → recognised self-limiting
complaint → default. Deterministic, so the same input always gives the same
tier — which is what a clinical review needs.

**Layer 2 — the model (`triage.py`). Optional.** Consulted only when
credentials exist; skipped silently otherwise. A missing key degrades quality,
it does not break the feature.

Layer 2 has **two interchangeable implementations**, and `_classify_with_model`
picks one. Both return the same `ModelVerdict`, both are reconciled by the same
`max()`, and neither can lower a tier — choosing a source is not choosing an
answer.

| | When | Shape | Cost |
|---|---|---|---|
| `deduction.py` | `LLM_BASE_URL` + `LLM_MODEL` set | agentic loop | free |
| `triage._classify_with_anthropic` | otherwise, if Anthropic creds exist | one shot | paid |

Five properties hold, each asserted by tests:

1. **SELF_CARE must be positively earned.** It requires a match against a
   recognised self-limiting complaint *and* no escalating modifier. Anything
   unrecognised resolves to URGENT. Not understanding a description is not the
   same as it being harmless — this is the single most important rule here.
2. Emergency red-flag screening runs **first** and sets a floor of EMERGENT.
3. Neither layer can **lower** the other's tier. They reconcile with `max()`,
   so either can escalate and neither can de-escalate.
4. The displayed reasoning never argues for a lower tier than the one shown.
   A model answer of SELF_CARE that lost to an URGENT rule does not get to
   supply the explanation.
5. Failure is **never** SELF_CARE. A model outage falls back to the rule tier;
   there is no path where an error produces reassurance.

**Adding or changing a rule:** add the phrase to the right list in
`rules_triage.py`, add a test, and remember that the lists are lay language —
people write "my face is drooping", not "face drooping". A stroke description
in natural word order was missed for exactly that reason; match both orders.

**Audit trail.** `intake_assessments` records the final tier, the rule tier,
which named rules fired, whether the rules defaulted, and what the model said
separately — so a reviewer can measure the rules and the model independently.

### The agentic layer (`deduction.py`), and the free endpoint under it

Setup and provider options: `docs/free-model-setup.md`.

The model layer used to be reachable only through a paid Anthropic key, so a
deployment without one ran on rules alone. It now also speaks to **any
OpenAI-compatible chat endpoint** (`app/services/llm.py`) — a hosted free tier
or a model on your own machine — and when one is configured, the model is
driven through a **bounded tool-using loop** rather than asked for a tier in
one call.

✅ **THE FENCE ON `triage.py` IS CLEARED FOR THIS CHANGE.**

The repository owner asked for this directly in conversation on 2026-09-05 —
use a free AI for symptoms, with agentic deduction in place of the rules-only
path — and that request is why the work exists. That request alone was **not**
the sign-off this fence requires, and an earlier draft of this paragraph that
claimed otherwise was rejected by a compliance review: a sentence an agent
writes into the same diff that needs authorising is not evidence of
authorisation.

The actual approval came separately, on 2026-09-06, when the owner was asked
by name — "Do you approve modifying `backend/app/core/triage.py` and adding
`backend/app/core/deduction.py` as a second (free, agentic) path to a
symptom-urgency tier — the fenced change CLAUDE.md requires you to approve by
name before it's committed?" — and answered, in conversation, in their own
words: **"Yes, approved as-is."** That is the third instance of this file's
"explicit human approval obtained outside of this pipeline," alongside the
`normalize_query` fix and the deployment approval below — a person answering a
direct question, not a chain of agent sign-offs.

**What was approved, specifically:** modifying `backend/app/core/triage.py`
(the dispatch in `_classify_with_model`, the `trace` fields, the renamed
`_classify_with_anthropic`) and adding `backend/app/core/deduction.py` as a
second, free path to a tier. **What this does not cover:** it is not approval
to merge to `main`, deploy, or touch anything else this file fences — those
each need their own answer to their own question, same as this one did.

What the change does *not* touch, verified by byte-diff against HEAD: any
disclaimer, any escalation copy, the emergency phrase lists, the rule lists,
`SYSTEM_PROMPT` and its tier definitions (4406 bytes, identical), and the
Anthropic layer's body (identical; only its name and docstring changed).

Per assessment the model calls `screen_red_flags`, then `apply_rules` — the
app's own deterministic screens — then records its reasoning a step at a time,
then concludes.

- **`conclude` is refused until both screens have been read.** A conclusion is
  therefore grounded in the reviewed phrase lists rather than in the model's
  recollection of them.
- **The screens take no arguments.** They always run over the description
  exactly as submitted. A tool that let the model choose the text would let it
  screen a rephrasing and talk itself out of a red flag.
- **The loop is bounded** (`MAX_STEPS`). Not concluding is an outage, not a
  tier, and the rule tier stands.
- **There is one copy of the instrument.** The tier definitions stay in
  `SYSTEM_PROMPT` in `triage.py` and are passed in, so a reviewer reads one
  prompt. `deduction.py` is machinery, not judgement.
- **The derivation is recorded** and goes to the dev-only classification log —
  never to the user, who gets the written reasoning instead. It is not written
  to `intake_assessments`: that needs a new column and this project has no
  migration tooling (see "Known Gaps"). Persisting it is a follow-up, and it
  is the thing that would make a wrong call diagnosable rather than merely
  visible.

⛔ **This does not lift any release blocker.** Driving the same unreviewed tier
definitions in more steps does not review them, and the classifier still has no
validated error profile. What changed is that a reviewer can now read a
derivation instead of a verdict, and that the layer no longer requires a paid
account.

### Third-party vendor: the model endpoint — BAA status

**Which base URL is configured is a data-handling decision, not a preference.**
Symptom descriptions are the most sensitive free text in this app.

- **A local endpoint** (`http://localhost:11434/v1`, Ollama or llama.cpp)
  transmits nothing. No image, no description and no derivation leaves the
  machine, so **no BAA question arises at all** — the same reasoning that put
  label OCR on the device.
- **A hosted free tier** (Groq, Google AI Studio, OpenRouter) transmits the
  full description to a third party, and **this project has a BAA with
  nobody**. Google's free tier may additionally use input for training. That
  is a privacy/legal decision, not an engineering one, exactly as with NLM.
- `llm.endpoint_is_local()` exists so the distinction is visible rather than
  assumed, and a non-local endpoint **logs a warning naming the exposure**, as
  this file requires of any new third-party processor. That does not make it
  safe; it stops it being silent.
- **Nothing from the request body reaches the application log.** Failures
  report a type and an HTTP status code only — a provider error body can quote
  the request, which is the user's description. A test asserts it.
- Defaults are empty, so out of the box there is no model layer and no
  transmission.

## Emergency routing (implemented)

`backend/app/core/emergency.py` screens every symptom query for red-flag
language before the content lookup runs: cardiac, breathing, stroke,
bleeding/trauma, anaphylaxis, loss of consciousness, self-harm, and
overdose/poisoning.

- Screening is deliberately **over-inclusive**. A false positive costs the
  user a few seconds; a miss could cost a life.
- Guidance renders **above all other content** on the screen, and results are
  shown beneath it rather than suppressed.
- It routes to 911 (or 988 for self-harm) and never names a condition or a
  treatment.
- It is returned **even when MedlinePlus is down**, so a content outage can
  never swallow the instruction to call for help.

The phrase lists are signposting terms drawn from public emergency
warning-sign guidance. **They have not been reviewed by a clinician** — that
review is required before release.

The general "When to see a doctor" copy is intentionally non-specific.
Condition-specific criteria ("seek care if your fever exceeds X") would be
clinical content this app is not permitted to author.


### Natural phrasing missed by literal phrase matching (FIXED 2026-09-06/07)

Found by testing the rule layer against ~50 lay descriptions of common
American illnesses (an ad-hoc exercise, not a permanent test corpus). Two
gaps, both the same root cause as the glued-list bug below: the phrase lists
in `emergency.py` and `rules_triage.py` require an exact literal substring, so
an ordinary insertion a real person types defeats a match that a slightly
different sentence would have hit.

- **Emergency screening missed common phrasings of anaphylaxis, breathing
  difficulty, sudden vision loss, and cardiac chest tightness.** `"my throat
  is closing and my tongue is swelling"` (anaphylaxis), `"hard time
  breathing"` / `"can't catch my breath"` (breathing), `"suddenly lost vision
  in my left eye"` (vision_loss), and `"chest feels tight"` (cardiac) all
  matched **nothing** and fell to the URGENT default instead of EMERGENT —
  the exact "not recognised is not the same as harmless" failure mode this
  file warns about, but on genuinely life-threatening presentations.
  **Fixed** by adding the missing phrasings to the existing lists in
  `_EMERGENCY_RULES`. `sepsis_meningitis` got a partial fix only (`"stiff neck
  with/and a fever"` variants); `"my neck is stiff and I have a fever"` — the
  two concepts named separately, in reverse order — was left a **known limit**
  needing a two-term combinator. **That combinator now exists** — see "Concept
  combinations" below — and that phrasing reaches EMERGENT.
- **A duration-escalation rule silently broke on the word "over."**
  `"sore throat for a week"` correctly returned URGENT, but `"sore throat for
  over a week"` — or `"sore throat for over two weeks, swollen glands,
  extremely tired"`, a plausible mono description — returned **SELF_CARE**,
  because `"for a week"` requires that exact substring and `"for over a
  week"` does not contain it. This directly undercut the module's own central
  invariant ("SELF_CARE must be positively earned... absence of alarming
  words is not evidence of safety"). **Fixed** by adding `"for over a
  week"`/`"for over two weeks"`/`"for over a month"` and `"for more than
  ..."` variants to `_URGENT_RULES`' `persistent_or_worsening` phrases, and
  bringing `_ESCALATING_MODIFIERS` back in sync with it (it was also missing
  `"for two weeks"` and `"for several days"`, which were already in the
  urgent list).
- ⛔ **Both edits were made to fenced modules** (`rules_triage.py`,
  `emergency.py`). They landed only after the user was told the specific
  bugs and specific proposed phrase additions in conversation and replied
  "fix it" — the same "explicit human approval obtained outside of this
  pipeline" basis the glued-list fix below records. Neither change lowers a
  tier, reorders evaluation, or touches a disclaimer, an emergency number, or
  escalation copy; both only add recognised phrases, which can make screening
  more sensitive and cannot make it less. `tests/test_emergency.py` and
  `tests/test_rules_triage.py` guard the new phrasings; full suite (598
  tests) passes.

### Concept combinations, for red flags a phrase list cannot express (2026-09-12)

Every phrase in `emergency.py` and `rules_triage.py` is a contiguous literal
compiled with word boundaries, so it matches only when a person writes the
concepts in the order the list spells them with nothing in between. The file
recorded the consequence against itself: `"my neck is stiff and I have a
fever"` matched nothing and fell to the URGENT default.

`backend/app/core/symptom_concepts.py` is the two-term combinator that gap
called for. A description is reduced to the set of concepts it names, and a
rule fires when all of a combination's concepts are present — any order, any
distance, any phrasing the lexicon knows.

- **Three combinations, and all three are read out of existing reviewed copy.**
  The `sepsis_meningitis` action text already reads "A stiff neck with fever, a
  rash that does not fade when pressed, or confusion with a high fever". Those
  are implementable without authoring a clinical claim *because the app already
  says them*; the phrase list simply could not detect them unless written as
  one string. ⛔ **A fourth combination is a new clinical claim** and needs the
  clinician sign-off this file requires. `test_the_set_of_combinations_is_fenced`
  fails if one is added, so that is a conversation rather than a line to edit.
- **The module defines no user-facing copy at all.** A combination resolves to
  a category id, and `_COPY_BY_CATEGORY` in `emergency.py` supplies that
  category's existing headline and action. There is one copy of every emergency
  instruction and a combinator cannot introduce a second. Asserted by a test.
- **It runs only after every literal phrase has been tried.** So anything that
  matched before matches identically now, in the same category, with the same
  wording — the combinator can only turn a `None` into guidance. That is the
  same one-directional argument `normalize_query`'s case-split rests on: it can
  make screening more sensitive and cannot make it less.
  `test_the_combinator_is_never_what_answered_a_literal_match` disables the
  combinator and asserts every pre-existing detection is unchanged.
- **No model, no network.** A closed, curated lay-vocabulary lexicon a
  clinician can read line by line, for the same reason the rule layer is a
  phrase list rather than a classifier.
- Known limit unchanged: the lexicon is lexical, so an unlisted synonym is
  still a miss, and a concept named in order to deny it ("no fever") still
  counts as named — the over-inclusive direction this file prefers.

⛔ **This edit was made to a fenced module.** `emergency.py` gained 42 lines and
lost 7, and the 7 were the stale comment recording the limit that is now fixed.
**No phrase was added, removed or reordered, and no copy changed** — verifiable
from the diff. The repository owner asked for this work in conversation on
**2026-09-12**, having been shown the specific proposal and told explicitly that
it restructures a fenced module and needs their approval by name. This paragraph
is the *record* of that, not the authorisation for it — this file is clear that
"a sentence an agent writes into the same diff that needs authorising is not
evidence of authorisation", and that applies to this sentence too. The owner
should confirm the wording here is what they intended to approve, and a
clinician still has to read the combinator as part of the instrument.

### Triage is measured now (2026-09-12)

`backend/scripts/triage_eval/` measures the rule layer against a corpus of
synthetic lay descriptions carrying gold tiers. It is modelled on
`topic_retrieval_eval/`, which is what let the retrieval numbers above be
reported rather than asserted.

    cd backend
    python scripts/triage_eval/measure.py
    python scripts/triage_eval/measure.py --strict   # non-zero exit on any
                                                     # unexpected under-triage

⛔ **What a number from this establishes, and what it does not.** Gold labels
are **this app's own documented intent**, assigned by a software engineer — each
case records a `basis` naming where its label came from. It measures consistency
with that intent and regression against it. It is **not** clinical validation
and must never be reported as clinical accuracy: neither the labels nor the tier
definitions they encode have been read by a clinician. The release blocker above
is untouched.

Metric names follow the published vignette-based evaluation standard for symptom
checkers, so the figures are comparable to the literature: *safety of advice*
(share of gold-EMERGENT returned EMERGENT), *under-triage*, *over-triage*, plus
two specific to this design — *rule coverage* (share where a rule recognised
anything, the ceiling on how often SELF_CARE can be earned) and the same metrics
restricted to **natural phrasing**. Treat the natural-phrasing figures as the
real ones: matching your own phrase list is trivially easy, and the corpus marks
which descriptions are paraphrases.

First run, 122 scored cases (rules only, no model): **96.7% exact agreement,
0 over-triaged, 4 under-triaged, safety of advice 90.7%, rule coverage 83.6%**.
On natural phrasings alone: 96.0% exact, safety of advice **87.1%**.

#### ✅ CLOSED 2026-09-14: the four under-triaged presentations

The harness found these on its first run and they were reported and left
untouched, because fixing them meant adding phrases to `_EMERGENCY_RULES` and
the owner had not been asked about those specific additions. **They were asked
on 2026-09-14 and all four are now fixed** (see "Ten thousand common illnesses"
below). All four were the same defect — the concept is named but not in the
exact character sequence the list spells — and all four were on
life-threatening presentations:

| Description | Returned | The list had | Now |
|---|---|---|---|
| "crushing pressure in my chest" | URGENT | `chest pressure`, `crushing chest` — not `pressure in my chest` | EMERGENT |
| "I hit my head hard and feel awful" | URGENT | `head injury` | EMERGENT |
| "I have been thinking about hurting myself" | URGENT | `hurt myself`, which does not match `hurting myself` | EMERGENT |
| "it is like a curtain came over my eye" | URGENT | `curtain over my eye` | EMERGENT |

`KNOWN_UNDER_TRIAGED` in `tests/test_triage_eval.py` is now **empty**, and the
suite is still a **sensitivity ratchet**: any new under-triaged case fails the
build. The four are asserted positively by
`test_the_four_reported_under_triaged_presentations_are_closed`, which is a
stronger claim than the "must still reach at least URGENT" they used to carry.
Two further tests hold the floor unconditionally — no gold-EMERGENT case may
ever return SELF_CARE, and screening may not get less sensitive.

### Ten thousand common illnesses (2026-09-14)

`backend/scripts/triage_eval/common_illness/` is a second, much larger corpus:
**236 of the most common American presentations**, each in several lay
phrasings, each wrapped in ordinary conversational framing, each surfaced the
way text actually arrives — curly apostrophes, block capitals, hurried spacing,
and pasted clauses run together. The cross product is 11,272 descriptions and
the scored selection is exactly 10,000.

    cd backend
    python scripts/triage_eval/measure_common_illness.py --strict
    python scripts/triage_eval/measure_common_illness.py --all --strict
    python scripts/triage_eval/diagnose.py --all --under

⛔ **It establishes exactly what `measure.py` establishes and no more.** Gold
labels are this app's own documented intent, assigned by a software engineer.
It is not clinical validation, no figure from it may be reported as clinical
accuracy, and the release blocker above is untouched. What it is good for is
finding places where a description a real person would write reaches the wrong
tier — which it did, in volume.

**The one rule the corpus rests on:** a presentation is labelled EMERGENT only
where `emergency.py` **already** defines a category covering it. Appendicitis,
testicular torsion, ketoacidosis and a pulmonary embolism described without a
named red flag are labelled URGENT with `escalation_deferred`, because
inventing a thirteenth red-flag category is a clinician's call this file
fences. Those are reported below, not fixed.

First run, then after the fixes:

| | Before | After |
|---|---|---|
| exact agreement | 93.3% | **100%** |
| under-triaged | 418 | **0** |
| over-triaged | 254 | **0** |
| safety of advice | 77.0% | **100%** (1,852/1,852) |
| self-care earned | 82.3% | **100%** |

The smaller 122-case corpus went from 96.7% exact / 90.7% safety of advice to
**100% / 100%** on the same changes. Full suite: 1,052 passed.

#### ⛔ The approval this rests on, and what it does not cover

The repository owner asked for this work in conversation on **2026-09-14** —
test the common illnesses, find the wrong answers, work out why, and fix them —
and was shown the specific defects and the specific proposed phrase additions
before they were made. That is the same "explicit human approval obtained
outside of this pipeline" basis as the `normalize_query` fix, the natural
phrasing fixes, and the concept combinator.

⛔ **This paragraph is the record, not the authorisation.** This file is
explicit that a sentence an agent writes into the diff needing approval is not
evidence of approval, and that applies to this sentence too. The owner should
confirm the phrase lists are what they intended to approve, and **a clinician
still has to read all of it as part of the instrument.**

It is **not** approval to merge to `main` or to deploy. Those are fenced
separately and need their own answer.

#### What changed, grouped by which direction it moves a tier

**Additive — can only raise a tier** (`_EMERGENCY_RULES`, `_URGENT_RULES`,
`_ESCALATING_MODIFIERS`). Lay phrasings of red flags the app already screens
for. No category was added, no copy changed, no phrase removed, nothing
reordered:

- **cardiac** — `pressure in my chest`, `pressure on my chest`, `chest gets
  tight`, `chest feels heavy` and similar. The list had the clinical word
  order (`chest pressure`) and not the one people type.
- **breathing** — `short of breath`, `breathless`. The list had only the noun
  form `shortness of breath`, so heart failure, pneumonia and an asthma flare
  in ordinary words all missed. Also breathlessness on *minimal exertion*
  (`out of breath just`, `out of breath walking`); ⛔ the bare phrase "out of
  breath" is deliberately **not** included — it is what everyone says after
  stairs, and a red flag that fires for every gym-goer is one people learn to
  ignore.
- **stroke** — `mouth droops`, `can't close one eye`, `face has dropped`. The
  list had the face and the arm but not the mouth or the eye.
- **bleeding_trauma** — `hit my head`, `banged my head`, `threw up blood`,
  `black tarry stools`. It had `head injury`, which is how a form field is
  labelled, not how a person speaks.
- **self_harm** — `hurting myself`, `cutting myself`, `don't want to be here`.
- **vision_loss** — `curtain came over my eye`, `part of my vision is gone`.
- **consciousness** — `fainted`, `blacked out`, `collapsed`, `lost
  consciousness`. `passed out` was in the list bare, but `fainted` appeared
  only inside the compound `fainted and won't wake` — two words for one event,
  screened differently.
- **infant_fever** — `baby feels hot`, `baby is burning up`. A parent at 3am
  does not type "infant fever".
- **pregnancy** — `bleeding and I am pregnant` and the conjunction-free forms.
  The list had `pregnant and bleeding`; the same two facts in the other order
  matched nothing.

#### ⛔ A plural defeated every red flag in the app

The most serious finding, and it was not a vocabulary gap but a matcher bug.
Every phrase is compiled with a `(?!\w)` guard, and a plural "s" is a word
character, so the guard failed on it:

| | |
|---|---|
| "I have chest pain" | cardiac → call 911 |
| "I am getting chest pains" | **nothing at all** |
| "she had a seizure" | consciousness |
| "she had seizures" | **nothing** |
| "I had a head injury" | bleeding_trauma |
| "I have had head injuries" | **nothing** |

`a stroke`/`two strokes` and `an overdose`/`overdoses` behaved the same way.
"Chest pains" is arguably the *more* natural phrasing and it received no
emergency guidance.

`emergency.plural_tolerant` is the fix: an optional trailing `s`/`es`, and
`y`→`ies`, at the end of a phrase only. ⛔ It can only make screening more
sensitive — it adds optional trailing characters to a pattern that already had
to match in full — which is the same one-directional argument
`normalize_query`'s case-split rests on. The old docstring on `_compile`
asserted that word boundaries "still allow normal plurals". That was untrue,
and being written down is probably why nobody checked.

#### ⛔ A false SELF_CARE: "a cold sore" matched "a cold"

The catastrophic direction, and the only defect in the set that was actively
dangerous. `a cold` is compiled with word boundaries and the boundary after
"cold" is satisfied by the space in "a cold sore", so **every description of a
cold sore earned SELF_CARE** and was told it would settle on its own. Nothing
else could catch it: the match was positive, so the safe default never ran and
no escalating modifier was present.

Fixed by a suffix exclusion in `_SELF_CARE_VOIDED_BY_SUFFIX`, deliberately the
narrowest possible change — deleting `a cold` would have fixed it and broken
"I have a cold", which is how most people say it.

#### ⛔ Two changes that LOWER a tier, and why they are different

Every other change in this pass raises a tier and is safe by construction.
These two are not, and they were authorised individually by the owner on
2026-09-14 after being shown what each one does.

**1. "Food poisoning" no longer routes to Poison Control.** The bare phrase
`poisoning` matched, so "I have food poisoning, cramps and diarrhea" returned
an instruction to call 911 and Poison Control. The owner's reasoning is the
record here: a person typing "food poisoning" is handing the app a
**self-assigned label**, and the app's job is to read what they actually
describe and judge severity from that. Letting the label short-circuit to an
emergency category triages the word rather than the person.

`_VOIDED_BY_PREFIX` in `emergency.py` is the **only narrowing in that file**.
It voids `poisoning` when — and only when — `food` immediately precedes it.
⛔ `poisoning` alone, `swallowed poison`, `overdose`, `drank bleach` and
`took too many pills` are all untouched, and a test asserts each one. Do not
add an entry there to quieten a false positive without the same explicit
approval: the one-directional property is what lets the rest of the file be
extended without re-reviewing all of it.

**2. The self-care list gained vocabulary and plurals.** 252 ordinary
complaints were returning URGENT because the list knew `a cold` but not "a
head cold" or "the sniffles", `sore throat` but not "my throat feels raw".
Added: `head cold`, `the sniffles`, `throat feels raw`, `tickle in my throat`,
`lost my voice`, `hoarse`, `croaky`, `dull headache`, `acid reflux`, `eczema`,
`dandruff`, `itchy scalp`, `cracked lips`, and the qualified sunburn and
blister forms. Plurals too — `mosquito bite` was already a reviewed phrase and
"a few mosquito bites" is the same complaint written the way people write it.

⛔ **Each new word is a decision that a complaint is ordinarily minor**, which
is the "SELF_CARE must be positively earned" rule this file calls the single
most important one in the module. They belong in the clinical reviewer's read.
What bounds them: the escalating-modifier check still runs over all of them, so
"a head cold and a high fever" and "reflux for over a week" are URGENT exactly
as before.

⛔ **Two are deliberately qualified rather than bare, and the reason is worth
keeping.** `blister` is not in the list bare, because shingles presents as "a
painful band of blisters" and a bare pattern would have reassured it. `sunburn`
is not bare either — and that one was **not caught by the corpus**. A bare
`sunburn` passed all 11,272 cases and still returned SELF_CARE for "sunburn
with blisters and I feel faint", found by a hand-written probe. The corpus does
not bound this risk; the qualifiers do. `tests/test_common_illness_findings.py`
holds both.

#### ⛔ REPORTED, NOT FIXED: what a reviewer still has to decide

1. **A two-concept red flag with the conjunction lost to a paste.** "Pregnant"
   and "Bleeding" pasted as adjacent list items normalise to "pregnant
   Bleeding" — two adjacent words with no "and" for a literal to hook on. The
   app's own answer is `symptom_concepts`, and this file fences it at exactly
   three combinations. A `pregnancy + bleeding` combination would be **read out
   of the pregnancy category's existing reviewed copy** ("Bleeding or severe
   abdominal pain during pregnancy needs urgent assessment"), which is the same
   argument that justified the three that exist — but the fence says a fourth
   is a conversation, so it is left alone. Pinned as a documented gap in the
   corpus, 4 cases, visible in every run. **This is the single highest-value
   change still available in triage.**
2. **Presentations with no category to reach.** Appendicitis, testicular
   torsion, diabetic ketoacidosis described without a named red flag, bowel
   obstruction, DVT, hypertensive crisis, acute glaucoma. Each returns URGENT
   **by default** — having recognised nothing — rather than by understanding.
   Whether any deserves a red-flag category is a clinician's call.
3. **Rule coverage is 59.5%**, so four descriptions in ten are still answered
   by the safe default. That is the ceiling on how often SELF_CARE can be
   earned, and the honest summary of how much of this instrument is a phrase
   list rather than an understanding.
4. **The all-caps glued list** remains open from the earlier corpus:
   "CHEST PAINSHORTNESS OF BREATH" has no case boundary to split on.
5. ⛔ **Six lay phrasings of red flags that no corpus contained (2026-09-20).**
   Found by probing the **live deployment** with descriptions written to sound
   like a frightened person rather than like a phrase list. Each reaches
   `defaulted=True`, tier URGENT, `emergency=None` — so the reply is the
   clarifying questionnaire, *"Where in your body do you feel it? How bad is
   it, from 1 to 10?"*, with no headline, no 911, no Poison Control and no 988.
   The standing `escalation_guidance` line is still there, so it is not
   silent; the emergency block is simply absent.

   | Description | Nearest phrase that DOES fire |
   |---|---|
   | "my chest feels like an elephant is sitting on it" | `chest pressure`, `chest feels heavy` |
   | "my lips are turning blue and I am wheezing badly" | *nothing — cyanosis has no phrase at all* |
   | "blood is pouring from the cut and won't stop" | `bleeding that won't stop` |
   | "I threw up something that looked like coffee grounds" | `threw up blood` |
   | "I took the whole bottle of pills" | `took too many pills` |
   | "it's like a curtain came down over one eye" | `curtain came over my eye` |

   ⛔ **Read the right-hand column before concluding this is a vocabulary
   problem.** Every one sits a word or two from a phrase that fires today:
   *"I took too many pills"* reaches Poison Control and *"I took the whole
   bottle of pills"* reaches nothing. This is the literal-substring limitation
   this file already documents, measured on the presentations where it costs
   the most — an overdose, a GI bleed, cyanosis, and the single most
   recognisable lay description of a heart attack in the language.

   The corpora do not bound this risk and were never going to: both report
   100% safety of advice while all six of these miss. This file already says
   why — *"a corpus cannot contain the phrasing nobody thought to write
   down"* — and this is that sentence being cashed in.

   All six are pinned in `scripts/triage_eval/corpus.py` as documented gaps,
   `[OPEN]` in every run, excluded from the scores so they cannot quietly
   flatter them. Closing any one means editing `_EMERGENCY_RULES`, which this
   file fences, so **they are reported and left untouched** — a fix is a case
   moving out of that section, measured rather than argued.

6. ⛔ **The six above were not the exception. They were the sample.**

       cd backend
       python scripts/triage_eval/phrasing_sweep.py

   `scripts/triage_eval/phrasing_sweep.py` asks the question the other two
   harnesses cannot: **does an existing category recognise ordinary ways of
   describing it?** 56 lay phrasings, every one of a presentation
   `emergency.py` already holds a category and reviewed copy for.

   **41 of 56 are missed — 73%.** Three categories recognised nothing at all:

   | category | recognised |
   |---|---|
   | stroke | **0 / 5** |
   | bleeding_trauma | **0 / 6** |
   | vision_loss | **0 / 4** |
   | overdose_poisoning | 1 / 5 |
   | breathing | 1 / 6 |
   | cardiac | 2 / 8 |
   | sepsis_meningitis | 3 / 3 |

   "half my face has gone slack", "my words are coming out as nonsense" and
   "I cannot lift my right arm at all" are the three things a stroke campaign
   teaches people to say, and none of them reaches the stroke category.

   ⛔ **Read the caveat as carefully as the number.** These descriptions are
   *an engineer's idea of how a frightened person writes* — not transcripts,
   not validated, not clinician-reviewed. That is exactly the standing of the
   gold labels in `corpus.py`, and the same limit applies: this measures the
   phrase lists against one person's guess at natural language, and a real
   miss rate would need real user text this project does not have. What it is
   good for is direction and magnitude, and a category that recognises none of
   six ordinary descriptions of itself is not a borderline call.

   ⛔ **A miss is not a reassurance.** The rule layer defaults to URGENT and
   `escalation_guidance` still travels with the reply, so the person is told to
   get seen and to call 911 if things change. What is missing is the headline,
   the number, and the instruction to ring it now — Poison Control for an
   overdose, 988 for self-harm. Read a miss as *the app said see someone soon
   where it should have said call an ambulance.*

   **This reframes what the 100% figures mean.** Both corpora report 100%
   safety of advice, and both are honest — they measure agreement with
   documented intent on the phrasings somebody thought to write down. This
   sweep is the other half, and it says the instrument is far more
   phrase-shaped than those two numbers suggest. The 59.5% rule coverage
   already hinted at it; this puts a number on what the gap costs at the
   EMERGENT end.

   The script deliberately **always exits 0**. A sweep of invented phrasings
   must never fail somebody's build, and a threshold would lend these numbers
   an authority they have not earned.

#### Licensed protocol content: the container exists, the content does not

`backend/app/core/protocol_content.py` loads a licensed telephone-triage
protocol set — the actual fix for "every phrase here was written by a software
engineer", which is an authorship problem that more phrases cannot solve.

It ships with **no content and is wired to nothing**, the same "built, gated and
unreachable" shape as the booking path behind `delivery_available()`.

- ⛔ **No protocol content may be committed to this repository** — not a sample,
  not a fixture. Content written by an engineer or an agent, loaded through the
  interface built for physician-reviewed content, is strictly worse than the
  phrase lists, which at least say plainly what they are.
  `test_no_protocol_content_is_committed_to_this_repository` globs the tree and
  asserts nothing protocol-shaped exists.
- ⛔ **No disposition-to-tier mapping of ours.** Deciding that "be seen within
  24 hours" means URGENT is a clinical judgement, so the loader **requires**
  each disposition to state its own tier and rejects content that omits one.
- **`reconcile()` is `max()`** — a protocol disposition may escalate the rule
  tier and may never lower it. Licensed content being better than the phrase
  lists is not a reason to let it talk a red flag down.
- **Fails closed.** One malformed protocol rejects the whole set; half a
  protocol set is a set with unknown holes in it. Mixed content revisions are
  rejected too. A broken content directory logs a warning and runs on the rule
  layer alone rather than taking the API down.
- `PROTOCOL_CONTENT_DIR` is ⛔ **not a feature flag**. Like
  `delivery_available()` it stands for a signed agreement — here a content
  licence. Schmitt-Thompson Clinical Content (used by ~95% of North American
  medical call centres, reviewed by 200+ practising physicians, revised
  annually) licenses to technology partners; that enquiry is the next step and
  it is a procurement decision, not an engineering one.

### Glued list items used to defeat red-flag screening (FIXED 2026-09-01)

Found from a real dev submission. A pasted list whose items arrive with no
separator between them — "Chest pain" + "Shortness of breath" becoming
`"Chest painShortness of breath"` — matches **nothing**, because every phrase
in `emergency.py` and `rules_triage.py` is compiled with word boundaries.

- The consequence is not cosmetic. An emergency description is not recognised,
  gets no 911 guidance, and falls to the URGENT default instead of EMERGENT.
- The case that surfaced it was harmless — a pasted list of cold symptoms
  arriving as `"Runny or stuffy noseScratchy or sore throatMild cough"`, which
  matched none of `runny nose`, `sore throat` or `mild cough` and so was
  classified URGENT by the default rather than SELF_CARE by the rules. **The
  same glue on a cardiac description is not harmless.**
- **Fixed in `normalize_query`** (`app/core/emergency.py`): a space is
  inserted at a lowercase-to-uppercase boundary before matching. It can only
  make screening *more* sensitive — it splits words apart and never joins them
  — so it cannot itself cause a miss.
- ⛔ **This edit was made to a fenced module.** It landed only after the user
  approved it directly in conversation, which is the "explicit human approval
  obtained outside of this pipeline" that the fence requires. No agent may
  repeat this on its own authority. `tests/test_emergency.py` now guards the
  behaviour, so removing the split fails the suite.
- **Known limit:** a list glued together in all capitals ("CHEST PAINSHORTNESS
  OF BREATH") has no case boundary to split on and is still missed.
- Second-order effect, and the reason the reported case is fully resolved: the
  rules now *recognise* the pasted cold rather than defaulting on it, so
  `is_needed` no longer asks the clarifying questions at all. The description
  returns SELF_CARE immediately, with no questionnaire.

Related, and for the same reviewer: **the follow-up questions can manufacture
an escalation.** `merge` folds answers into the description on purpose, so
that an answer carrying a red flag escalates like volunteered text would. But
`_ESCALATING_MODIFIERS` contains "sudden"/"suddenly", and round two asks "How
did it start?" with **"Suddenly" as a listed choice**. A recognised
self-limiting complaint therefore becomes URGENT whenever the user picks that
option — the questionnaire supplies the modifier that overrides its own
self-care match. Over-triage is the intended direction, so this is not a bug
in the safety model; but a reviewer should decide whether an answer the app
offered should carry the same weight as a phrase the user volunteered.

The window for this is narrow, and worth stating so it is not over-read: the
questions are only asked when the rules recognised nothing, and in that case
the tier is already URGENT by default, so "Suddenly" usually changes nothing.
It bites only where round-one answers bring a self-care phrase into a
description that had none, and round two then takes it back out.



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### ⛔ BLOCKING: symptom intake requires clinical and legal sign-off


The symptom-intake feature estimates how soon a user should be seen —
EMERGENT, URGENT, or SELF_CARE — from free text. **It must not be put in front
of real users until both of the following are signed off and recorded here.**
This is a release blocker, not a recommendation.

1. **A licensed clinician** must review the tier definitions, the system
   prompt, the deterministic red-flag lists, the follow-up questions and the
   dose-schedule phrase lists, plus a corpus of real classifications. Nothing
   in this feature was written or reviewed by a clinician; the tier boundaries
   are a software engineer's construction.
2. **Legal counsel** must determine whether this is a regulated medical device
   in each target market. Software that recommends time-critical care ("go to
   an ER now") from symptom input is materially different from reference
   content, and the earlier informational-only posture of this app does not
   cover it. Also unresolved: liability for an under-triage, and what the audit
   trail must retain.

What a reviewer must be told — each expanded in `docs/triage.md`:

- The classifier has **no clinically validated error profile**. Two measurement
  harnesses exist (`scripts/triage_eval/`, and the 10,000-description
  `common_illness/` corpus). ⛔ **They establish consistency with this app's own
  documented intent and nothing more.** Gold labels were assigned by a software
  engineer, no figure from either may be reported as clinical accuracy, and the
  release blocker is untouched.
- ⛔ **A presentation is labelled EMERGENT in the corpus only where
  `emergency.py` already defines a category covering it.** Appendicitis,
  testicular torsion, ketoacidosis and a pulmonary embolism described without a
  named red flag are labelled URGENT with `escalation_deferred`, because
  inventing a thirteenth red-flag category is a clinician's call this file
  fences. Those are reported, not fixed.
- ⛔ **Under-triaged presentations are REPORTED, NOT FIXED.** Fixing them means
  editing fenced phrase lists, which nobody has approved. They are pinned in
  `KNOWN_UNDER_TRIAGED`, making the suite a **sensitivity ratchet**: a new
  under-triaged case fails the build, and so does fixing a pinned one without
  recording the approval.
- The audit trail (`intake_assessments`) exists but **nobody is reviewing it**.
  Assign that owner.
- Intake descriptions are the most sensitive free text in the app and are **not
  encrypted at rest**.
- **The clarifying questions are part of the instrument**, not UI copy — which
  questions get asked shapes what the classifier sees. So is the rule that
  picks round two's third question, and the rule that skips a round-one
  question the description already answered.
- ⛔ **`model_confidence` is recorded and never acted on.** It must not become
  an input to the tier without review: a confidence threshold that softened a
  tier would invert the one-directional safety property the design rests on.
- ⛔ **The follow-up questions can manufacture an escalation.** Round two offers
  "Suddenly" as a choice and `_ESCALATING_MODIFIERS` contains it, so an answer
  the app offered can override a self-care match. Over-triage is the intended
  direction, so this is not a bug in the safety model — but a reviewer should
  decide whether an offered answer should weigh the same as volunteered text.

### How the safety architecture works

Two layers. **The rule layer is the product; the model is an optional upgrade.**
Read `backend/app/core/rules_triage.py`, `backend/app/core/triage.py` and
`docs/triage.md` before changing any of it.

**Layer 1 — rules (`rules_triage.py`). Always runs. No key, no network, no
cost.** Explicit phrase lists a clinician can read line by line, evaluated in
order: emergency red flags → urgent indicators → recognised self-limiting
complaint → default. Deterministic, so the same input always gives the same
tier — which is what a clinical review needs.

**Layer 2 — the model (`triage.py`). Optional.** Consulted only when
credentials exist; skipped silently otherwise. A missing key degrades quality,
it does not break the feature. It has two interchangeable implementations — the
agentic loop in `deduction.py` when `LLM_BASE_URL` + `LLM_MODEL` are set,
otherwise a one-shot Anthropic call if those creds exist. Both return the same
`ModelVerdict` and are reconciled the same way, so choosing a source is not
choosing an answer.

⛔ **Five properties hold, each asserted by tests. Do not weaken one:**

1. **SELF_CARE must be positively earned.** It requires a match against a
   recognised self-limiting complaint *and* no escalating modifier. Anything
   unrecognised resolves to URGENT. Not understanding a description is not the
   same as it being harmless — this is the single most important rule here.
2. Emergency red-flag screening runs **first** and sets a floor of EMERGENT.
3. Neither layer can **lower** the other's tier. They reconcile with `max()`,
   so either can escalate and neither can de-escalate.
4. The displayed reasoning never argues for a lower tier than the one shown.
5. Failure is **never** SELF_CARE. A model outage falls back to the rule tier;
   there is no path where an error produces reassurance.

In the agentic path, `conclude` is refused until both screens have been read,
the screens **take no arguments** so they always run over the description as
submitted, and the loop is bounded — not concluding is an outage, not a tier.
⛔ **There is one copy of the instrument**: the tier definitions live in
`SYSTEM_PROMPT` in `triage.py` and are passed in. `deduction.py` is machinery,
not judgement.

**Adding or changing a rule** (needs approval — the modules are fenced): add
the phrase to the right list in `rules_triage.py`, add a test, and remember the
lists are lay language — people write "my face is drooping", not "face
drooping". Match both orders.

⛔ **The set of concept combinations in `symptom_concepts.py` is fenced.** A
fourth combination is a new clinical claim; the three that exist were read out
of emergency copy the app already shows. A test fails if one is added. The
combinator runs only **after** every literal phrase has been tried, so it can
only turn a `None` into guidance, and it defines **no user-facing copy at all**.

⛔ **No protocol content may be committed to this repository** — not a sample,
not a fixture. `protocol_content.py` is a loader for licensed,
physician-reviewed content and ships empty. Engineer-written content loaded
through it would be strictly worse than the phrase lists, which at least say
plainly what they are. `PROTOCOL_CONTENT_DIR` is ⛔ **not a feature flag**; it
stands for a signed content licence. It **fails closed** — one malformed
protocol rejects the whole set — and requires each disposition to state its own
tier, because deciding that "be seen within 24 hours" means URGENT is a
clinical judgement.

⛔ **Symptom intake is deliberately NOT rate limited.** A 429 on
`POST /intake/assess` is a refusal to screen someone who may be describing
chest pain. The cost exposure is real, but the limit belongs at a reverse proxy
tuned by someone who has read this architecture.

### Emergency routing (implemented)

`backend/app/core/emergency.py` screens every symptom query for red-flag
language before the content lookup runs: cardiac, breathing, stroke,
bleeding/trauma, anaphylaxis, loss of consciousness, self-harm, and
overdose/poisoning.

- Screening is deliberately **over-inclusive**. A false positive costs the user
  a few seconds; a miss could cost a life.
- Guidance renders **above all other content**, and results are shown beneath
  it rather than suppressed.
- It routes to 911 (or 988 for self-harm) and never names a condition or a
  treatment.
- It is returned **even when MedlinePlus is down**, so a content outage can
  never swallow the instruction to call for help.
- The general "When to see a doctor" copy is intentionally non-specific.
  Condition-specific criteria ("seek care if your fever exceeds X") would be
  clinical content this app may not author.
- `normalize_query` inserts a space at a lowercase-to-uppercase boundary before
  matching, so a pasted list arriving glued together still screens. It can only
  make screening *more* sensitive. ⛔ **Known limit:** an all-capitals glued
  list has no case boundary to split on and is still missed.

The phrase lists are signposting terms drawn from public emergency
warning-sign guidance. **They have not been reviewed by a clinician** — that
review is required before release.

