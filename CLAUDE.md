# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

**This file is the rules. `docs/` is the reasoning.** Every prohibition, fence
and release blocker is stated here in full, because an agent that has not read
a rule will break it. The history behind each one — why a phrase list is shaped
the way it is, what a measurement returned, which bug a design avoids — lives
in the linked files, and you should read the relevant one before changing that
area. A rule here is binding whether or not you opened the doc.

The index of detail files is at the foot, under "Where the detail lives".

## App Scope

**Purpose:** Helps users look up general information about common symptoms/conditions
and set medication reminders.

**This app is informational only.** It must never:
- Diagnose a user's condition
- Recommend a specific treatment
- Present itself as a substitute for professional medical advice

Every screen that displays symptom or condition information **must** include a
visible, non-dismissible-by-accident disclaimer directing the user to consult a
healthcare professional. Do not ship any such screen without one.

**Emergency handling:** If a user describes anything resembling an emergency
(e.g., chest pain, difficulty breathing, severe bleeding, suicidal ideation,
loss of consciousness), the app must surface emergency-services guidance
("Call 911 / your local emergency number now") instead of generating any
app-authored advice. Emergency detection and routing takes priority over normal
symptom-lookup flow.

Treat any UI copy or backend response touching symptoms, conditions, or health
recommendations as sensitive by default — see "Subagents" below.

## Tech Stack

- **Frontend:** React Native (Expo 51) + TypeScript, React Navigation
- **Backend:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL, SQLAlchemy ORM (Alembic is *not* wired up)
- **Auth:** JWT-based, HS256 (placeholder in parts — see Known Gaps)
- **Target platforms:** iOS and Android via Expo, plus a web export

Chosen by Claude as a reasonable default. If you would prefer a different
stack, say so before much more code is built on it.

## Data Rules

- **No real patient/health data anywhere in this repository, ever.** All dev
  and test data (fixtures, seed scripts, screenshots, example payloads) must be
  synthetic/fake only. Never paste real symptoms, conditions, or medication
  data from a real person into this repo, issues, or commit messages.
- Any field that could later hold real health data (symptom entries, medication
  names/dosages/schedules, free-text notes) must be **designed for encryption
  at rest and in transit from the start**, even though the current scaffold
  does not yet implement it:
  - Transit: HTTPS/TLS everywhere, no exceptions for internal traffic.
  - At rest: prefer column-level or full-disk encryption on the database;
    avoid storing sensitive free-text fields unencrypted "temporarily."
  - Do not log request/response bodies that contain user health data.
- **BAA flag:** Before this app goes live with real user data, anywhere it
  touches a cloud vendor (hosting, database, email/SMS for reminders, push
  notifications, crash/analytics reporting, AI/LLM APIs) needs a signed
  Business Associate Agreement if that vendor will process PHI. **This is not
  in place with anyone.** Flag it explicitly in any PR description or design
  doc that adds a new third-party service, rather than assuming it is handled.

Vendors this app actually contacts, and what each receives — every BAA unsigned:

| Vendor | Receives | Detail |
|---|---|---|
| NLM / MedlinePlus | up to 3 keywords from symptom text, in a GET URL | `docs/medical-content.md` |
| Model endpoint (`LLM_*`) | the full symptom description, if non-local | `docs/triage.md` |
| Model endpoint (`GOALS_LLM_*`) | health-goal text, if non-local | `docs/health-goals.md` |
| CMS / NPPES | a 5-digit ZIP and a care setting — no health data | `docs/appointments.md` |
| US Census geocoder | providers' public addresses — no user data | `docs/appointments.md` |

⛔ **Which model base URL is configured is a data-handling decision, not a
preference.** A local endpoint transmits nothing, so no BAA question arises at
all. A hosted free tier transmits the most sensitive free text in the app to a
third party this project has no agreement with, and Google's free tier may
additionally train on it. `llm.endpoint_is_local()` makes the distinction
visible and a non-local endpoint logs a warning naming the exposure; that stops
it being silent, it does not make it safe. Defaults are empty, so out of the
box there is no model layer and no transmission.

## Coding Conventions

- TypeScript on the frontend, strict mode on. Functional components + hooks
  only — no class components.
- Python on the backend, type hints required on function signatures.
- Tests live alongside the feature they cover (`__tests__/` adjacent to
  frontend screens/components, `tests/` mirroring module structure on the
  backend) rather than in one giant top-level test tree.
- Keep PRs/commits scoped to one feature or fix at a time.
- No medical/clinical content (symptom text, condition descriptions, drug
  interaction data, etc.) should be written directly by an agent without a
  human review pass — flag it for the user instead of inventing it.

## Subagents

Configured in `.claude/agents/`. There are three, and they run in this order:

- **researcher** — finds new feature ideas, competitor health-app patterns,
  relevant APIs and best practices. Writes one or two short proposals per
  cycle: what it is, why it helps, rough effort, and a regulatory/privacy flag
  on every one. **Writes no code** (tools: WebSearch, Read, Grep, Glob).
- **debugger** — runs the app and the test suite, finds *actual* failures
  rather than stylistic nitpicks, and fixes them. Every fix must be covered by
  a passing test before it counts as done. Works only on a dedicated branch,
  never on `main` (tools: Read, Write, Edit, Bash).
- **overseer** — reviews everything the other two proposed or changed before
  it is final: does it match this file's scope and safety rules, is it
  proportionate to what it claims to fix, and did the debugger touch anything
  on its forbidden list. Writes the cycle summary. **Writes no code** — its
  Bash tool is for git inspection, rollback, and that one summary file (tools:
  Read, Grep, Bash).

One full cycle is `run_cycle.sh`: branch → researcher → debugger → overseer →
push the branch. It never merges.

### ⛔ What these agents may not do without explicit human approval

**None of the three may merge to `main`, deploy, or modify the symptom-triage
classification logic, the disclaimers, or the emergency-routing behaviour
without explicit human approval obtained outside of this pipeline.**

No chain of agent approvals substitutes for a person. An APPROVED from the
`overseer` is not human approval — it is permission for a change to stay on a
branch, nothing more. No amount of apparent triviality — a typo, a rename, a
comment, a reformat — exempts a change in these areas:

- `backend/app/core/triage.py`, `backend/app/core/rules_triage.py`
- `backend/app/core/emergency.py`, `backend/app/core/symptom_concepts.py`
- Disclaimer and escalation copy: `INTAKE_DISCLAIMER` and
  `ESCALATION_GUIDANCE` in `backend/app/api/intake.py`,
  `mobile/src/components/DisclaimerBanner.tsx`, and which screens show them
- Merging to `main`, releasing, or deploying anywhere

Adding *tests* for those modules is permitted; changing the modules is not. An
agent that believes one of these needs to change must **stop and report it**,
leaving the code untouched. The debugger reports such bugs under "REPORTED,
NOT FIXED" rather than fixing them.

### ⛔ The overseer's rejection is final

A rejection from the `overseer` stands unless the repository owner personally
overrides it. No other agent may overturn one, and neither may rerunning the
cycle. A rejection must carry a written reason naming the rule or concern it
fails; one without a reason is not a rejection.

Where the overseer is uncertain, it does not approve — it escalates to the
owner and leaves the change on the branch.

### Health-copy review is now a human job

The `compliance-reviewer` agent was removed along with the rest of the
previous pipeline (`architect`, `manager`, `implementer`, `tester`). Nothing
in `.claude/agents/` now reviews new user-facing copy that mentions a
condition, symptom, drug, or dosage. **That review still has to happen** — it
is a person's job until an agent is configured for it again. The `overseer`
checks changes against this file's rules, which is a narrower thing than a
compliance read of clinical copy.

### Approvals on record

The times the fence above was cleared. Each was the repository owner answering
a direct question in their own words, in conversation, outside the agent
pipeline. ⛔ **A sentence an agent writes into the same diff that needs
authorising is not evidence of authorisation** — which applies to this table
too. An earlier draft that claimed otherwise was rejected by a compliance
review.

| Date | What was approved | Covers |
|---|---|---|
| 2026-09-01 | the `normalize_query` case-split in `emergency.py` | that fix |
| 2026-09-02 | deploying the demo publicly, open sign-up over an invite code | that deployment |
| 2026-09-06 | modifying `triage.py`, adding `deduction.py` — "Yes, approved as-is." | those two files |
| 2026-09-06/07 | named phrase additions to `_EMERGENCY_RULES` / `_URGENT_RULES` — "fix it" | those phrases |
| 2026-09-07 | building health goals on a branch | building it |
| 2026-09-12 | restructuring `emergency.py` for the two-term combinator | that change |
| 2026-09-12 | removing the health-goal blocking (`MEDICAL_GOAL`, `_FORBIDDEN`) | that removal |
| 2026-09-13 | detailed, sourced, goal-sized plans | that work |

⛔ **Not one of these is clinical sign-off, and none authorises merging to
`main`, a second deployment, a custom domain, or any other gated thing that
happens to be reachable.** Ask again, each time, for each thing.

## Known Gaps (intentional, for this scaffolding pass)

Stubbed out on purpose — do not treat them as bugs to silently fix, raise them
with the user first:

- **Auth is a placeholder.** No real token refresh and no session
  invalidation. The session survives a reload, but nothing renews it and
  nothing can revoke it.
- **No encryption at rest.** See Open Findings.
- **No BAA-covered vendors selected.**
- **No migration tooling.** Alembic is not wired up; the start command runs
  `scripts/create_missing_tables.py`, which creates missing tables and **never
  alters existing ones**. ⛔ A column added to an existing model therefore
  needs a hand-written script, run once against every database created before
  the change, or that table's endpoints return 500s. The three that exist —
  `add_medication_supply_columns.py`, `add_goal_schedule_columns.py` and
  `add_goal_detail_columns.py` — are idempotent and in the Render start
  command.
- **Background reminder delivery on the web does not exist.** A browser only
  alerts while the page is open. That is a vendor/BAA decision, not an
  engineering gap.
- **Appointment booking does not exist**, and is blocked on a partnership and
  a BAA rather than on engineering.

## ⛔ BLOCKING: symptom intake requires clinical and legal sign-off

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

## Medical content: where it comes from

The app never authors medical content. All symptom and condition text is
fetched from **MedlinePlus** (NIH/NLM) through its public health-topics API.
Full reasoning, the retrieval rules and the measured accuracy:
`docs/medical-content.md`.

⛔ **Rules for anyone extending this:**

- **Render source text verbatim.** Do not summarise, paraphrase, shorten, or
  re-section it. Rewriting sourced material makes it app-authored medical
  content.
- **Do not extract "causes"** — or any other clinical category — out of a
  summary. A bulleted list in these topics is sometimes causes, sometimes
  symptoms, sometimes treatments; relabelling one as another invents a clinical
  claim. The source's own categories surface as "May be associated with".
- **Always carry attribution** (`source_name`) and the link back to the topic.
- **If the source is unavailable, show an error.** Never fall back to generated
  content.
- **A topic is shown only if a name the source gives it contains a word the
  user wrote** (`names_match` — its title, or one of NLM's own published
  `altTitle` synonyms, which are match input only and are never rendered).
  Non-matching topics are dropped, **never reordered**: ranking health topics
  by relevance would be a clinical judgement this app may not make.
- Free text is reduced to search terms (`app/services/search_terms.py`). This
  is **retrieval only** — it chooses which article to fetch and never alters
  the text shown. Three rules there exist because of measured wrong answers,
  not theory, and each is orthographic or positional rather than clinical:
  conversational scaffolding is filler, single words are tried
  **last-word-first**, and negations are kept but never searched alone.
  ⛔ Re-measure rather than reason about changes to it.

### ⛔ Related reading is gated off (`MEDLINEPLUS_TOPICS_ENABLED=false`)

Intake ships with reading material **switched off**, after a compliance review
found the known limit unacceptable to put in front of users: the filter is
lexical, so a context word that happens to name a topic still gets through —
"my head has been pounding" returns "Head and Neck Cancer", "nauseous after
eating" returns "Eating Disorders" — and a frightening, unrelated topic
rendered under a person's own description reads as a suggested diagnosis
regardless of the framing around it.

**Do not switch it on until a clinician has ruled on how topics are chosen.**

- While off, **no MedlinePlus request is made at all**, so no symptom text
  reaches NLM and that vendor's BAA question is moot for as long as it stays
  off.
- The retrieval code and its tests stay intact and exercised — the flag gates
  the call, not the code.
- A lexical tightening was tried and rejected: requiring more than a bare
  body-part word empties the good cases. Telling a location word from a symptom
  word is a semantic judgement, so the realistic fix is model-assisted topic
  selection — still retrieval, not authoring — which needs its own review.

## The symptom picker (implemented 2026-09-16)

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

## Emergency card (implemented)

A screen the user fills in once — allergies, known conditions, blood type, who
to call — readable in one tap from the home screen, working with no connection.
`mobile/src/screens/emergency/`. Detail: `docs/emergency-card.md`.

**This is not the emergency routing feature.** `app/core/emergency.py` is
fenced; nothing here touches it, reads it, or feeds it. The card is a place to
write something down.

⛔ **Rules:**

- **It is stored on the device and nowhere else.** No endpoint, no table, no
  `fetch` on this path — a test asserts it. It has to work when nothing else
  does, and the backend has no encryption at rest.
- **`localStorage` on web is deliberate here, and is not the rule
  `tokenStorage.web.ts` sets.** A card that vanishes when the tab closes is a
  card that is not there when it is needed, and it grants nobody access to
  anything. Both halves are asserted by tests, so "fixing the inconsistency" in
  either direction fails the suite. The cost — on a shared computer the card
  outlives sign-out — is written on the editor, with "Erase this card" offered.
- **Nothing on the card is authored, checked or interpreted by MedHelp.** Every
  field is free text, stored and rendered verbatim. No picker of conditions, no
  list of common allergies, no validation of a blood type. Nothing reads the
  card either — it is not an input to triage or to anything else.
- **An empty field renders as "Not provided", never as a missing row.** The
  single most important rule on the screen: a card with no allergies row reads
  as *no allergies* to whoever is holding the phone. Asserted by a test.
- The mirrored medication list is **name and dosage only**, at most 25 entries,
  each field capped at 300 characters — which also keeps it inside Android
  SecureStore's ~2048-byte limit, above which a write is lost silently.
  `clearCard()` removes it too, and the card says it may be out of date.
- `EmergencyCardLink` and `EmergencyCallBar` stay **different components**. One
  opens a screen; the other routes to emergency services. Merging them would
  blur the one instruction that has to be unambiguous.

## Medication label scanning (implemented)

A user can photograph a prescription label instead of typing. Manual entry is
unchanged and remains the primary path. **The OCR runs on the device** — Apple
Vision on iOS and ML Kit on Android via `expo-mlkit-ocr`, Tesseract WASM in a
browser. Both paths share one parser, so a label reads identically wherever it
is scanned. Detail: `docs/label-scanning.md`.

⛔ **Rules for anyone extending this:**

- **Nothing scanned is ever saved without the user confirming it on screen.**
  The scan screen cannot write a medication; every path out of it opens the
  ordinary form, prefilled, and the user presses the same save button as
  someone who typed it in. A misread dose that saved itself would change when a
  person takes a medication with nobody having looked at it.
- **Directions are carried across verbatim.** Do not expand BID/TID/QHS or
  reword anything — decoding an abbreviation into dosing instructions would be
  app-authored clinical content, and a wrong expansion changes medication
  timing.
- **Doses are never restated or converted.** "250 mg/5 mL" stays a
  concentration. Only spacing and unit capitalisation are tidied.
- **Drug names are never corrected against a dictionary.** A misread name stays
  misread so the user can see it is wrong. Snapping OCR output to the nearest
  real drug turns a legible mistake into a plausible one.
- **Only the four fields the form already stores are extracted.** The patient's
  name, address and Rx number are deliberately not read out, and the raw OCR
  text is discarded inside `readLabel` rather than returned to any screen.
- A failed or low-confidence read **falls back to manual entry with whatever
  was extracted prefilled**, never to a dead end.
- ⛔ **Do not copy "makes no network call" onto the web file.** The native path
  makes none whatsoever; Tesseract downloads its WASM core and training data
  from a CDN. What travels is the model coming down, never the image going up —
  so no PHI is transmitted either way, but the two statements differ.

## Medication reminders (implemented)

A user sets daily times for a medication and is notified at each one. The times
come from a suggestion the user confirms; nothing schedules itself. Detail,
including refill alerts: `docs/medication-reminders.md`.

### ⛔ MedHelp proposes times. It never sets them.

`frequency` is the sig line, carried verbatim. Turning "TWICE DAILY" into two
alarms is a decode of dosing instructions — the thing the verbatim rule
forbids. So the feature is read-then-confirm: `dose_schedule.py` proposes from
an explicit phrase list a clinician can check line by line, the suggestion
endpoint **writes nothing** (a test asserts a suggestion leaves the user with
no reminders), and reminders exist only after the user presses save with the
printed directions unedited beside the draft.

**It declines far more readily than it guesses.** Anything not on the lists
returns no suggestion and a reason the user is shown. Deliberately refused:
**"as needed" / PRN** — recognised only in order to refuse it, because an
interval on a PRN label is a *maximum*, not a schedule, and an alarm built from
it would tell someone to take a medicine they may not need (the most important
refusal here); anything not a daily rhythm; and food or route qualifiers, which
stay in the verbatim text and never become mealtimes. Times are rejected, never
reinterpreted: `8am`, `0800` and `8:00` are refused, because "8" could be
either end of the day. The default clock hours are neutral waking-hours
conveniences, **not clinical choices**, and the UI says so.

⛔ **Further reminder rules:**

- **A reminder time is a local wall-clock "HH:MM", never a UTC instant.**
  Converting through a timezone would move a medication time when the person
  travels. Same rule for goal activity times.
- **This is not an adherence record.** A time that has gone by shows as
  "earlier today", never "missed". Nothing tracks, scores, or reports
  adherence.
- **Deleting a medication deletes its reminders**, in the endpoint as well as
  by foreign key — a leftover row is not untidy data, it is an alarm telling
  someone to take a medication they have stopped. SQLite does not enforce the
  cascade, so the test asserts against the table, not the listing.
- **These are local notifications only.** No push token is requested, nothing
  is registered with Expo's push service, FCM or APNs. ⛔ **Do not add
  `getExpoPushTokenAsync` or Web Push without a BAA decision** — a payload
  naming a person's medication makes those services processors of PHI.
- **Never ask for notification permission without a user gesture.** Same rule
  and reason as location: an unprompted request is suppressed by browsers, and
  a blocked site never prompts again. `getPermission()` only reads what is
  already granted; a button is the only thing that asks.
- `medication_reminders` stores **no medication name** — it joins for that. A
  second copy would be a second place health data leaks from.
- The **on-screen list is the part that is always correct**; the notification
  is the bonus on top. The notification body names the medication, which makes
  it visible on a lock screen — accepted for now.

### ⛔ Arming: one function, every time, the complete set

`scheduleAll(reminders, { refillAlerts })` is called from
`mobile/src/services/reminderArming.ts` **and nowhere else.** Dose reminders
and refill alerts cannot be armed separately — `cancelAll()` clears everything
and does not distinguish between them, so two arming functions would take turns
cancelling each other's work, and the symptom is a notification type that
silently stops firing depending on which screen was opened last.

More *callers* are fine — `rearm()` runs at app start from `RootNavigator` as
well as from the reminders screen, because arming only on that screen meant a
person who set their times and opened any other tab had nothing armed at all.
A **partial arm** is what the rule forbids. Runs are serialised, because app
start and a focus effect really do overlap. Both properties are tested. Arming
is best-effort and never surfaces an error.

### ⛔ Refill alerts: the estimate never borrows the record's authority

`refill_date` is a date the user wrote down; `refill_estimate` is arithmetic
MedHelp did. Separate fields, badges, wording and lead times — **do not
collapse them.**

- **The directions line is never read.** `forecast()` does not take a
  `frequency` argument and `refill_forecast.py` does not import
  `dose_schedule`; both are asserted by tests against the signature and the
  module's imports, so adding one is a failing suite rather than a quiet change
  of policy. `doses_per_day` comes from a number the user typed, or the count
  of their enabled reminder times — rows that exist only because someone
  reviewed a draft and pressed save.
- **`is_estimate` is a property that cannot be constructed false**, and is true
  whenever there is a date at all. The projection assumes every dose is taken
  exactly on schedule, which MedHelp cannot check. Tests assert no surface says
  "missed", "skipped" or "forgot".
- **Declining is a normal outcome** — no quantity, no confirmed doses-per-day, a
  count dated in the future, or more than a year's supply each return no date
  and a reason meant for the user. A confident wrong run-out date is worse than
  none for someone deciding whether to chase a prescription.
- Nothing rounds up. The run-out date is parsed as **local midnight, not UTC** —
  `new Date("2026-09-18")` is UTC by specification, which would move the alert a
  day for most of the Americas. A refill alert is a **one-off and never
  repeats**; a dose reminder repeats daily. The lead time is a **device**
  setting, not an account one, because there is no user-settings table and
  adding one would put a row about a named person's medication habits into a
  database with no encryption at rest.

## Appointments and provider search (implemented)

A user can search a real provider directory (NPPES, published by CMS), open a
provider, and record an appointment. Detail: `docs/appointments.md`; the option
analysis for real booking: `docs/appointment-booking.md`.

### ⛔ MedHelp does not book appointments, and must not say it does

Every API that can actually place a booking (Zocdoc, Epic-hosted scheduling,
athenahealth) needs a signed partnership, provider-side opt-in and a BAA. This
project has none of the three, so the transmission step is **absent and
labelled absent**, rather than mocked.

- **Creating an appointment contacts nobody.** It writes a row. The provider
  has never heard of it. Three screens say so, and `request_delivery.py` raises
  rather than quietly succeeding.
- **`provider_notified` is the single source of truth** for whether anyone was
  contacted, and is never inferred from `status` — a user can mark a row
  SCHEDULED because they rang the clinic themselves.
- **Availability is not shown, because no source for it exists.** NPPES
  publishes none; `Provider` has no slot field and neither does the API
  response, and tests assert both. ⛔ **Do not add a slot picker, a "Book now"
  button, or a time, until a real scheduling integration exists behind it** —
  drive any new affordance off the `online_booking_available` flag from the
  API, never off an assumption in a component. A time this app invents is a
  time someone turns up for.
- ⛔ **Do not flip `delivery_available()` to unlock the UI.** It is not a
  feature flag; it stands for a signed BAA and a scheduling partnership.
  Flipping it starts transmitting PHI to a vendor with no agreement in place.
  The endpoint returns 503 *before* it processes an identity, and the app reads
  the capability and never renders the identity form.
- **MedHelp does not rank or recommend providers.** Results are sorted by
  distance only, and the screen says the app cannot tell you who is accepting
  patients, open now, or in network. Ordering providers on clinical grounds
  would be a judgement this app may not make.
- **The provider search must never carry health information.** It sends a
  5-digit ZIP and a care *setting* from the fixed `CARE_SETTINGS` list; a
  free-text specialty is rejected on purpose, because "Urgent Care" in a CMS
  query log says nothing about the person searching and "Oncology" would. A
  test asserts the outbound parameter set.
- **Hospitals are searchable, because a hospital is a setting.** NPPES also
  enumerates individuals under that taxonomy, and that is the source's own
  classification — relabelling or filtering it would assert something about a
  provider the directory does not say.

### ⛔ Identity is pass-through, and must stay that way

Identity fields are built from one request, handed to the delivery layer, and
dropped. `app/schemas/booking_identity.py` is the only place they exist. The
user retypes them per booking — the accepted cost of not holding a table of
names, dates of birth and home addresses in a database with no encryption at
rest. Five rules, each asserted in `tests/test_booking_identity.py`:

1. **`appointments` has no column that could hold an identity field**, and
   `BookingIdentity` is not a SQLAlchemy model. The test checks the mapped
   table, so near-misses like `patient_name` or `dob` are caught.
2. **`AppointmentOut` never carries identity** — echoing it back would put a
   date of birth into client logs and crash reporters.
3. **`BookingIdentity.__repr__` is redacted.** pydantic's default prints every
   field, so an identity in a stack frame would leak a name and home address
   into any traceback that touched it.
4. **Never put one in a React Navigation param.** Route state is serialisable
   and dev tooling persists it, so a date of birth in a param is written to
   disk. The identity screen takes an appointment **id**.
5. **A rejected identity is not echoed back** by the validation handler.

**Pass-through is not the same as "not liable."** Transmitting this to a vendor
makes them a processor of PHI just as surely as storing it would. It shrinks
the breach radius; it does not remove the BAA requirement.

### ⛔ Location, and how a distance is worked out

- **Never ask for location without a user gesture.** `getPostalCode()` only
  uses a permission already granted and reports `"prompt"` otherwise; only a
  button press calls `getPostalCode({ prompt: true })`. `"prompt"` gets **no**
  error notice — it is not a failure, the button is the thing to press. This
  was a real bug reported as "I never get prompted": requesting on mount is
  suppressed by browsers, and once a site is blocked it never prompts again.
- **Geolocation needs a secure context, and a LAN address is not one.** Served
  at `http://192.168.x.x` the API is refused whatever the user chooses —
  verified, not assumed. Chrome reports it as ordinary permission denial, so
  the client checks `window.isSecureContext` **first** and reports `insecure`,
  rather than telling someone they refused a permission they were never asked
  for. **Typing a ZIP is a first-class path, not a fallback.**
- **No third-party geocoder ever sees the user's coordinates**, on either
  platform — a test asserts it. On native they never leave the phone; on web
  they reach MedHelp's own backend as a POST body, are resolved against a
  committed public-domain Census ZCTA extract, and are discarded. ⛔ Do not copy
  "coordinates never leave the phone" onto the web file.
- **Distance is ZIP-centroid to the provider's geocoded street address**,
  computed server-side, always rendered with a "~". It is not a driving
  distance, and it is **not a distance from the user** — the honest reading is
  "about N miles from the middle of your ZIP code". ⛔ **A zero is never
  shown**: centroid-to-centroid gave five of six Las Vegas providers "~0.0 mi"
  for clinics up to three miles apart, so an unplaceable provider gets `None`,
  which renders as no distance at all.
- **Failure costs accuracy, never results.** Providers are already fetched by
  the time geocoding runs; an outage falls back to the centroid estimate.
- `provider_locations` **has no user column and must never gain one.** Adding
  a `user_id`, or a note of who looked, would turn a table of public addresses
  into a log of which clinics a named person was looking for. A test asserts
  the column set. Answers are cached by NPI, so a warm cache makes zero
  requests.
- **There is no map, on any platform.** Nothing imports a maps SDK. Adding one
  would need a keyed tile vendor and its own privacy review.

### The URGENT tier routes here

`IntakeResultScreen` navigates in-app to provider search, carrying the
description forward as the reason for visit so nobody retypes their symptoms
into a second form. It is prefilled and **editable** — it was written to answer
a triage question, not to tell a receptionist why you are coming in.
`urgency_tier` is stored on the appointment as a **label only**; nothing
re-derives urgency from it, and nothing in this feature may touch the triage
layer.

⛔ That block is on a screen this file fences. It changes no disclaimer, no
escalation copy and no triage or emergency module, and EMERGENT routing is
untouched — but it changes what an URGENT reader is offered at the moment they
are told to seek care, so **it belongs in the clinical reviewer's read of that
screen** rather than being treated as ordinary UI work.

## Health goals (implemented)

A person writes down a goal, confirms the plan and daily schedule MedHelp
proposes for it, and ticks the activities off. Detail: `docs/health-goals.md`;
prompt reasoning and the reviewer's open questions: `docs/health-goals-prompt.md`.

### ⛔ The blocking was removed on 2026-09-12. Read this first.

**MedHelp now proposes a plan for any goal a person types, including a medical
one, and no deterministic check screens what it proposes.** Two things were
deleted at the repository owner's direct request: the `MEDICAL_GOAL` refusal
(which is how "lose weight" and "get my blood pressure down" reached the person
as a refusal instead of a plan), and `_FORBIDDEN`, the phrase-list veto where
one match anywhere discarded the whole plan.

⛔ **Be clear-eyed about the cost rather than reassured by what is left.** The
only thing now constraining an authored plan is `PLAN_SYSTEM_PROMPT`. A prompt
is an instruction that is usually followed; a phrase list was a check that
always ran. A prompt fails open and silently. This is a materially weaker
position than the one this file described before, and it was chosen
deliberately — not arrived at by drift. Two tests pin the removal, so
reinstating either is a failing suite and a conversation, not a tidy-up.

⛔ **Suggestions are not clinically reviewed, and they are what everyone sees.**
No clinician has read `PLAN_SYSTEM_PROMPT`, and since 2026-09-12 it is the
whole of the guard rather than one layer of two. It belongs in the same review
as `followup.py` and `dose_schedule.py` and is now clearly the most urgent of
the three.

⛔ **The safety checks are asymmetric, and origination is on the weaker side.**
The quoting and digit checks cannot apply to a plan nobody wrote, so an
originated row is guarded by the prompt alone, where a structured row is
guarded by the prompt *and* the requirement that it quote the person. Almost
every row a person sees is an originated one. **Reinstating a narrow, reviewed
veto list is the cheapest safety work available in this feature** — it is
deliberately not guessed at here, and it is the first thing to ask the clinical
reviewer about.

### ⛔ What still holds, and may not be removed

1. **Every suggestion is labelled and confirmed.** `generated=True` reaches the
   screen, the row reads "Suggested by MedHelp — edit it or remove it", and
   editing a row's text clears the label because it has become the person's
   own. Nothing is saved until they press save. **Never render a suggested row
   without that label.**
2. **No benefit claims.** Propose the activity and stop — "Walk after lunch",
   never "walk after lunch to bring your blood sugar down". A benefit claim is
   the app authoring a health claim, and it is the easiest line to break now
   that the veto is gone.
3. **Still no medication or clinical targets.** No dose, no supplement, no
   change to anything prescribed, and no target figure for a weight, blood
   pressure, blood sugar or calorie count. These are a clinician's call, and
   refusing them is not the same as refusing to plan.
4. **Emergency screening runs first and is untouched.** `api/goals.py` calls
   `screen_for_emergency` before the model, and its guidance is returned
   alongside whatever else happened.
5. **The `structure` fallback is unchanged**, checks and all. Where the planner
   fails, the person's own quoted words come back rather than an empty editor —
   the same rule as a model outage in triage never being SELF_CARE.

### ⛔ The prompt is an instrument: its examples, length and order are properties

- **An example in a prompt is a suggestion, not an illustration.** This has cost
  the feature two bugs. `WHAT TO PROPOSE` once illustrated a row with "Walk
  after lunch", "Go to bed at the same time each night" and "Cook dinner at
  home" — and those three came back *as* the plan, for goals that were not about
  walking, sleep or cooking. The same shape produced generic titles one section
  earlier. Copied rows are now **named as the failure rather than offered**.
- **The absolute constraints bracket the ambition material.** Where a rule sits
  in the prompt is part of the rule; do not reorder or pad without re-measuring.
- **Vagueness is asked for, not checked, and that asymmetry is the honest
  part.** A prompt asks and a check enforces. Do not describe the vagueness work
  as a guard.

### ⛔ Ambition is bounded by published guidance, never by us

- **It is a ceiling to build towards, never a target to announce.** Never
  propose more than a published adult recommendation.
- **The floor and the ceiling count different things**, and `WEEK_SHAPE_BY_COMPLEXITY`
  **bounds coverage, not effort** — that distinction is the whole design. A
  discard costs the person their plan, so the bands are wide. ⛔ **Read `SCALE`
  and the two tables as they are now worded, not as they were.**

### ⛔ Citations attribute; they never assert

`core/goal_evidence.py` is a closed register of published guidance. Detail:
`docs/health-goals.md`.

- **A citation claims one thing: that this KIND of activity is the subject of
  published guidance.** It never claims the guidance endorses this plan, this
  person, or this row's numbers.
- **The model picks an id from a closed list and can never write a citation.**
  It chooses which register entry applies; it does not author a publisher, a
  quotation or a link.
- **An unknown id becomes no citation, never the nearest one.** Same rule as a
  misread drug name never being snapped to the nearest real drug.
- **Only the id is stored.** The quotation and link are assembled on the way
  out, so there is one copy of every quotation in this app.
- **Rewriting a row drops its citation and its detail.** Both were written for
  the sentence that was there; leaving them under new words attributes a
  publisher's guidance to words the publisher never saw.
- ⛔ **Nothing that estimates urgency may read this register.** A test asserts
  it — the triage instrument and this are separate things and must stay so.
- **Never put the publisher's name on the closed control.** "CDC ›" would lend
  the app an authority it has not earned; the citation is folded away on the
  screen people open every day, and ⛔ **the open/closed state is said in the
  accessible label**, not only in the caret.

### ⛔ `detail` says how, never why

A row is the instruction; `detail` is one or two plain sentences saying how to
do it on the day. Required of every suggested row — a row without one discards
the plan, the same as a row without a schedule. **The moment a sentence
explains what an activity will do for somebody's body or illness, the app is
authoring a health claim.** `MAX_DETAIL_CHARS` is a crude proxy for that and is
honest about being one: long enough to be an article is long enough to have
started explaining.

### ⛔ The structuring rule is checked, not trusted

Every activity read out of the person's own words must carry a `source_phrase`
that occurs in the submitted text, and `core/goal_structuring.py` discards the
**whole draft** if any does not. A model that wants to add stretching to a
walking goal has to quote "stretch" out of text that never contained it.
**No digit may appear in an activity unless the person wrote it** — an invented
number is the likely shape of an invented duration, distance or dose.

⛔ This applies to the **fallback path only**. Suggested rows are exempt by
construction, since nothing was written to quote. `_validate_plan` checks shape
— a title, a day list, an `"HH:MM"` — and does not look at content at all.

### ⛔ Further goal rules

- **Never add a progression engine.** Nothing may increase a target because a
  week went well; that is authoring, one week at a time, and it is exactly what
  the substring check exists to prevent.
- **Never add a second model to review the first.** A gate whose failure mode
  is a silent pass is not a safety layer. The checks here are deterministic for
  the same reason the triage rule layer is a phrase list a person can read.
- **A refusal returns a code, never a sentence.** The strings a person reads
  live in `_REFUSAL_NOTICES` in `api/goals.py`, because user-facing text in a
  health app is reviewed text. `core/goal_structuring.py` must never return
  prose.
- **Failure is never a plan.** No endpoint, an outage, or a failed check all
  yield an empty editor plus the server's own sentence. `_discard()` logs
  **which check** caught a draft — the check's name only, never the value that
  failed it, which is the person's own health text.
- **This is not an adherence record.** A tick is a note the person made for
  themselves; an unticked activity means nothing was ticked, not that anything
  was missed. **No streaks, no percentages, no "3 of 4 done" tiles** — a test
  asserts the words never appear. A tick reads "ticked off for today" or "not
  ticked off"; ⛔ never "missed", "skipped" or "failed".
- **An activity with no days is unscheduled, not daily.** It reads "Whenever
  you choose" and is never marked due — nobody chose those days. Due rows read
  ⛔ **"Due today", not "Today"**, because the tab bar already has a tab called
  Today and one word meaning two things is worse for a screen reader.
- **A time is a local wall clock, never a UTC instant**, and is refused rather
  than guessed. A row with no usable day list or time discards the whole plan —
  a silently half-scheduled plan is harder to notice than an absent one.
  `cadence` and `times_per_week` are **derived from `days`** server-side, so a
  plan cannot say "three times a week" beside four ticked days.
- A `structure` row carries **no schedule at all** — a clock time is digits
  nobody wrote.
- A completion is a **local calendar day** sent by the client, never a UTC
  instant. Deleting a goal deletes its activities and every tick, in the
  endpoint as well as by foreign key.

### ⛔ Editing a saved goal

- **Rows are matched by `id`, and that is the whole design.** A `GoalCompletion`
  points at an activity id, so replacing the activity rows on every save — the
  easy implementation — would silently discard the person's ticks for every goal
  they ever edited. A row that keeps its id is edited in place and keeps its
  history; a row with no id is new; a row the payload omits is deleted along
  with its completions, explicitly, because SQLite does not enforce the cascade.
- **An id that is not on this goal is a 400, never a new row.** Treating it as
  new would let a stale client detach a row from its ticks with nothing
  appearing to go wrong. Sending one id twice is refused for the same reason —
  the loser would vanish in silence.
- **The editor proposes nothing.** No description box and no call to
  `draftGoal`; the model is not consulted from that screen at all. Editing is
  not an occasion for MedHelp to write more health content. A saved row is never
  relabelled "Suggested by MedHelp" — the person confirmed every row when they
  pressed save, so the label would be false.
- **`description` is not editable and must not become so.** It is the text the
  person originally wrote and what `structure`'s quoting check ran against — the
  record of what was asked for, not a field.
- ⛔ **`detail` and `evidence_domain` are assigned on every edit, and every
  column on `goal_activities` must be.** Leaving them out was silent data loss:
  an edit that changed only a time would have stripped the "how" line and the
  published citation off *every row of the goal*, with nothing on screen saying
  so. Two tests pin it.
- **The clearing of those two is deliberate and belongs to the client.** A
  citation attributes published guidance to the sentence MedHelp wrote, so when
  somebody replaces that sentence, leaving the publisher's name under it would
  attribute their guidance to words the publisher never saw.
  `GoalPlanEditor.updateText` clears them. That is why the server **assigns
  rather than merges** — a "keep what was there" merge could not express it.
- ⛔ **`ActivityOut` returns `evidence_domain` beside the resolved `evidence`.**
  `evidence` is rebuilt server-side on every read, which keeps one copy of every
  quotation in this app, and it cannot be turned back into an id. Without the id
  no editor could say "this row is unchanged". Only the id travels in either
  direction; the publisher, quotation and link stay the server's.
- ⛔ **`GoalCreateScreen` does not use `GoalPlanEditor`, and the duplication is
  known.** The create screen renders a draft's provenance, none of which applies
  to a saved goal. What is duplicated is the day chips, the time check and the
  React Native Web accessibility workaround. Folding them together is worth
  doing; it was not worth doing inside a merge resolution.
- `GoalPlanEditor`'s rows carry their own `source` and `suggested` labels rather
  than parallel arrays indexed by position, which is what stops a label landing
  on the wrong line after a removal. A correctness question, not a cosmetic one.

The goals screens deliberately do **not** use `DisclaimerBanner` — which
screens show it is fenced, and adding it to a new screen is a reviewer's call.
⛔ They carry a plain statement instead, rewritten on 2026-09-12, and **the old
wording must not come back**: "MedHelp tracks what you decide to do, does not
decide what your goals should be" stopped being true the moment the app began
proposing plans. A test asserts the current text.

**Not built, deliberately:** reminders for a goal, and any weekly review.
Neither is hard, but both add surface to an instrument no clinician has read.

### ⛔ Goals may use a different model endpoint from triage

`GOALS_LLM_BASE_URL` / `GOALS_LLM_MODEL` / `GOALS_LLM_API_KEY`, each falling
back to its `LLM_*` counterpart when empty. One set of settings used to serve
every model caller, so pointing them at a hosted provider to get goal
suggestions also started sending **symptom descriptions** there — the most
sensitive free text in the app, belonging to the feature with the standing
release blocker. **A data-handling decision must not happen as a side effect of
switching on a different feature.**

- **Unset, the overrides change nothing** — asserted by a test, because that
  property is the whole reason this was safe to add.
- **A Groq key on its own is enough**, read in `goals_endpoint()` ⛔ **and
  nowhere else, and it must stay that way.** A key that switched on both
  features at once would make the most sensitive free text in the app a side
  effect of switching on goal suggestions, which is precisely what the split
  exists to prevent. Precedence: an explicit `GOALS_LLM_BASE_URL` wins, then
  `GROQ_API_KEY`, then `LLM_*` — so a leftover key cannot redirect goals away
  from an endpoint someone chose deliberately, including a local one. A bare key
  is only reassigned when it carries Groq's own `gsk_` prefix and has no base
  URL beside it, so the vendor is read off the key rather than assumed.
- The shortcut is through the configuration, never the disclosure: a hosted
  endpoint still logs the transmission warning naming Groq and the goal text.
- ⛔ **`tests/conftest.py` must blank every one of these.** The autouse
  `_no_live_model` guard exists because the suite once made real calls from a
  developer's `.env`; each new setting is a new hole in it.
- **Nothing from a response body reaches the application log.** Failures report
  a type, an HTTP status, and a provider error *code* only when it is on the
  allowlist — ⛔ it is an allowlist, not "log whatever we were given", because a
  provider error message can quote the request, which is the user's own health
  text. A test asserts an unfamiliar body contributes nothing but its status.
- `llm.completions_url()` corrects only the two base URLs people actually
  mistype. ⛔ Nothing else is guessed — rewriting an unknown host would hide the
  real mistake.

## ⛔ The suite is checked against itself

`backend/scripts/mutation_check.py` and `mobile/scripts/mutation_check.mjs`
break a rule on purpose and confirm a test fails. **A passing suite is evidence
about the tests, not about the code** — four of this repository's tests were
green for the wrong reason. Detail: `docs/mutation-testing.md`.

- ⛔ **It never touches the working tree.** Every mutation is applied to a
  scratch copy. The client's scratch copy lives under `mobile/` rather than the
  system temp directory.
- ⛔ **The triage group reads fenced modules and changes none of them**, and all
  five safety properties are covered.
- ⛔ **A mutation that changes nothing reports SURVIVED and looks exactly like a
  missing test.** An anchor that does not apply is reported, never counted as
  caught.
- ⛔ **A survivor is not fixed by deleting the mutation. Fix the test.**
- ⛔ **This is not clinical validation and does not touch the release blocker.**

## ⛔ `accessibilityState` does nothing on web. Say state in the label.

Not a quirk of one component — a property of the library. **React Native Web
0.19.13 never reads `accessibilityState` at all**, so on a `Pressable` it is
silently dropped and the DOM carries no state attribute.

It is still right on native, so **keep it and add the state to
`accessibilityLabel`** — the one thing that works on every platform.

⛔ **A test that asserts `accessibilityState` is not evidence about a browser.**
It passes in jsdom whether or not anything reaches the DOM, which is how two
goals bugs survived a green suite. **Assert the label.**
`mobile/__tests__/accessibleState.test.ts` holds the rule by reading the source
rather than rendering. ⛔ **`EXEMPT` is not a snooze button** — each entry must
name the route by which state genuinely reaches the DOM, and a test asserts the
reasons are real. Adding a file to it to make the suite green is how a list
like this becomes the place bugs go to be forgotten.

⛔ The consent-checkbox fix is text on the intake screen, so it belongs in the
clinical reviewer's read of that screen — the same standing as the URGENT
hand-off. Detail: `docs/accessibility.md`.

## Application security posture (implemented)

Full detail, including what each control does not cover and the nine closed
findings with their fixes: `docs/security-posture.md`.

⛔ **The signing key is the whole of authentication.** Every per-user filter
trusts one thing: a bearer token signed with `JWT_SECRET_KEY`, so a weak or
public key defeats all of them at once. `.env.example` once published a working
default, which is not a secret — it is in every clone. `Settings` now rejects a
missing, short (<32 char) or placeholder key. Outside development that is a
**refusal to boot**, not a warning, because a health API that comes up with a
published signing key looks fine from the outside. Inside development the key
is replaced with a random one per process. **No usable default may be
reintroduced.**

⛔ **The algorithm is fixed at HS256 in code and is not configurable.** It used
to be read from the environment, which is how algorithm-confusion and
`alg: none` forgery start. `iss`, `aud`, `typ`, `exp` and `iat` are *verified*,
not merely present, and `strict_aud` is on — without it PyJWT accepts an `aud`
list that merely contains ours. The library is PyJWT, deliberately not
python-jose (which dragged in `ecdsa` and its unfixed advisory). ⛔ **The two
libraries spell claim requirements differently and PyJWT ignores option keys it
does not recognise**, so jose-style `require_exp` would read like it demanded a
claim while demanding nothing — and a token with no `exp` never expires.
`test_a_token_missing_a_required_claim_is_rejected` pins each one.

⛔ **There is still no revocation.** `logout()` forgets the token on the device;
a stolen one stays valid at the server until it expires (60 minutes). `jti` is
minted so a denylist can be added without invalidating every issued token.

### ⛔ The session survives a reload, and dies with the tab

Native keeps the token in the Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
so a credential for health data stays out of iCloud sync and encrypted backups.
The browser keeps it in `sessionStorage`.

- ⛔ **Do not move the browser's copy to `localStorage`.** This is a bearer
  credential for one person's medications, appointments and symptom assessments,
  in an app with no revocation. `sessionStorage` ends with the tab, which is what
  should happen when someone walks away from a shared computer, and it costs the
  user nothing: the token is only valid for an hour. Neither store is protected
  from script on the page — the defence against that is the CSP. (The emergency
  card's `localStorage` is the deliberate exception, argued above.)
- **The navigator decides which screen to open before it mounts.**
  `RootNavigator` renders a spinner until `restoreSession()` answers, rather
  than showing a signed-in user a login form they never had to fill in.
- **Only the server decides whether a token is valid.** The client reads `exp`
  for one reason — not to restore a session it can already see is dead — and a
  token it cannot parse is restored and allowed to fail as a 401.
- **A 401 clears the store**, in all three request paths.
- **Sign out resets the navigation stack** to `Login` rather than navigating, so
  the back gesture cannot walk into signed-in screens. It ends the session on
  the device only. ⛔ It deliberately does **not** clear the emergency card, and
  the screen says so.

### Sign-in, CORS, headers, transport

- Both `/auth/login` and `/auth/signup` spend from a per-address budget. ⛔ Read
  `app/core/rate_limit.py`'s limits before relying on it: per process, in
  memory, keyed on the socket address, and it deliberately does **not** trust
  `X-Forwarded-For` — honouring that without a proxy you control would let an
  attacker reset their own counter every request. It is the floor under a
  reverse proxy, not a replacement for one.
- Login costs the **same work whether or not the account exists**. The
  identical error message was already there; without this the response *time*
  answered the question that message was written to avoid answering.
- ⛔ **Signup still discloses that an address is registered.** Kept on purpose:
  without an email-verification flow, hiding it means telling someone their
  account was created when it was not.
- **CORS is an explicit allowlist** (`CORS_ALLOW_ORIGINS`), `allow_credentials`
  off because the app uses a bearer token rather than a cookie, and `*` refused
  outside development. The development-only loopback/LAN regex mirrors
  `mobile/src/services/baseUrl.ts` — ⛔ **keep the two in step.**
- Every response carries `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, a `default-src 'none'` CSP (skipped for the
  docs pages), and `Cache-Control: no-store` — the last is not boilerplate,
  because these responses are one person's health data and a browser disk cache
  is a place it leaks from later. HSTS is sent only when the request already
  arrived over TLS.
- `/docs`, `/redoc` and `/openapi.json` are development-only. An unauthenticated
  map of every route and field is free reconnaissance.
- ⛔ **Served over http on a LAN, credentials and every symptom description
  cross the network in the clear.** `scripts/generate_dev_cert.py` helps, but
  state the property precisely: a self-signed certificate **encrypts without
  authenticating** — it does not stop someone on the network impersonating the
  server. Real users need a CA-issued certificate against a real hostname.

## Public deployment (implemented)

Deployable to a public URL from one Render blueprint at `render.yaml`: a static
site for the web build, the FastAPI backend, and Postgres. Procedure and
failure modes: `docs/deployment.md`.

⛔ **Approved on 2026-09-02 for this demo only**, after the owner was told that
a public link means anyone who finds it can create an account and type real
symptoms into an instrument no clinician has reviewed. It does **not** authorise
switching on `MEDLINEPLUS_TOPICS_ENABLED`, setting `TRIAGE_LOG_CLASSIFICATIONS`,
flipping `delivery_available()`, a second deployment, a custom domain, or
merging to `main`.

Publishing closed exactly one finding, and because of the host rather than any
code here: traffic is now encrypted **and authenticated** by a CA-issued
certificate, which as a side effect makes the browser Geolocation API work for
the first time. Nothing else moved. Two things got **worse**: the rate limiter
is now the only thing between a public address and the sign-in endpoint, and
the dev-only findings are no longer dev-only in practice. **Synthetic data
only, there as here.**

⛔ **Two services, not one.** The API's response headers are deliberately
hostile to HTML — `default-src 'none'` would stop the bundle loading and
`geolocation=()` would switch off the "Use my location" button. Serving the web
build from FastAPI would mean relaxing a reviewed security control to save a
configuration line. The app is told where the API is **at build time**
(`EXPO_PUBLIC_*` is inlined by babel), so ⛔ **a rename of the API service needs
the web service rebuilt, not restarted.** CORS is a literal in the blueprint
because Render will not resolve a cycle; if the site's URL is suffixed, correct
it by hand — the symptom is an app that loads and then fails every request.

## Visual direction and layout (implemented)

Paper ground, Literata over Public Sans, hairline rules instead of shadows, and
a four-level prominence ladder with **exactly one filled action per screen**.
Reasoning, the responsive breakpoints and the home-screen reshuffle:
`docs/visual-design.md`. Brand: `docs/brand-guidelines.md`.

⛔ **Rules:**

- **The reviewed safety colours did not move.** `emergencyText`,
  `emergencySurface`, `emergencyBorder`, and the `notice*` / `error*` /
  `success*` families are byte-for-byte what they were. **Do not restyle a
  safety family to match a future direction** — a direction is a preference,
  those are a decision someone signed off on. Also untouched:
  `DisclaimerBanner.tsx`, the intake disclaimer's copy, palette and position
  above the input, and which screens show them.
- **The emergency palette is exempt from the one-filled-action rule.** "Call
  911" and the emergency card's contact call stay filled wherever they appear,
  however many other filled controls share the screen. The ladder exists to
  stop the app shouting; the one thing it may always shout about is how to get
  help.
- **Set `fontFamily`, never `fontWeight` or `fontStyle`.** Each weight is a
  separate font file; asking Android to bolden a face that is already bold gets
  a synthetically smeared double-bold, and `fontStyle: "italic"` shears an
  upright face rather than using the italic.
- **Import font faces by their per-weight subpath.** `@expo-google-fonts/*`
  package roots `require()` every weight they ship — the first web export after
  the redesign carried ~2 MB of fonts nobody asks for. `expo-font` is pinned to
  `~12.0.10`; npm will resolve it to 57.x, which does not work on Expo 51.
- **Nothing renders until the faces load, but a font *failure* never blocks** —
  a screen painted before the faces land is painted at the wrong metrics, but
  blocking the emergency card behind a font download would be indefensible.
- `typography.overline` stays at **13px**. The direction drew section labels at
  11px; small uppercase type is the first thing to fail for anyone with low
  vision, and that accessibility floor outranks a mockup.
- ⛔ **Do not pass `page` to make a lonely-looking form or list wider.** `form`
  and `wide` are line-length limits, and a 1140pt line of body text is harder
  to read than a 660pt one. Only a screen whose children actually split into
  columns should use `page`.
- ⛔ **What may never fill the extra space:** clinical content of any kind, and
  **numbers about the user's health**. A "3 of 4 taken today" tile would invent
  a clinical fact about the user. The panels that do fill it are statements
  about the software, each restating something this file already says.
- The intake screens were deliberately left alone. Moving a required disclaimer
  into a side column changes its prominence, which is a reviewer's call and not
  a layout one.
- The serif is the app quoting and the sans is the app speaking: Literata only
  for text a person wrote or a source published. Single-line fields stay sans —
  an email or a ZIP is data, not prose.

### ⛔ Navigation rules

- **The home-screen reshuffle was a move, not a removal.** Every destination
  that came off the home screen is on `MoreScreen`, named in full, one tap away.
  **No route was renamed, removed, or re-parameterised.**
  `__tests__/navigationReachability.test.ts` reads the navigator's registrations
  and every `navigate`/`replace`/`reset` target across `src`, and fails when a
  registered route has no way in, or something targets an unregistered route —
  because the failure mode of a reshuffle is not a crash, it is a screen that is
  still registered, still tested, still perfect, and that nothing reaches any
  more. `ROOTS` names routes entered without navigation; keep it short. Nothing
  is nested deeper than More.
- **A screen that hides the navigator header owns its own way back.**
  Reachability has two directions and the first version of that test checked
  only one. `EmergencyCard` set `headerShown: false`, which also removed the
  back button, and **a browser has no back gesture** — so every control on it
  went deeper and it had no way out at all, with the whole suite green. It was
  found by opening the screen in a browser. Anything setting
  `headerShown: false` must call `goBack` itself; a test asserts it. `Login`,
  `Signup` and `Home` are exempt for real reasons, not by oversight.
- **"Add medication" opens the form, not the list.** The card names an action,
  so it performs it — `MedicationEdit` with no parameters. Routing it through
  the list would make it two taps for the thing the card says.
- **The inline appointment is not "the next one."** MedHelp does not know when
  an appointment is: `preferred_time` is free text by design ("Thursday
  morning"), and the appointment rules fence adding a scheduled datetime. So the
  home screen shows the most recently *recorded* open appointment under **MOST
  RECENTLY RECORDED**, and a test asserts it does not say "Next". It repeats
  "MedHelp has not contacted anyone" for a REQUESTED appointment, because a list
  is skimmed and whether the clinic knows is the one thing a user must not
  misread. The lookup **fails silently** — an error notice on the first screen
  of the app, over a line of supporting detail, is the wrong trade, and
  `AppointmentListScreen` reports its own failures properly.
- The scope panel is kept at **every** width. Dropping it below the expanded
  breakpoint would quietly make the scope statement a desktop-only feature.

## Open data-handling findings

Nine are closed with tests, listed with their fixes in `docs/security-posture.md`.
⛔ **Re-run `pip-audit` and `npm audit` rather than trusting a paragraph** —
advisory counts are a snapshot.

**Still open — each needs a call before the app holds real user data:**

1. **The app connects to Postgres as the `postgres` superuser**, with the
   password in plain text on disk. Create a least-privilege role owning only the
   app's tables. Transport is forced (`sslmode=require` outside development);
   the *identity* the app connects as is unchanged.
2. **Nothing is encrypted at rest.** `medications`, `intake_assessments`,
   `medication_reminders`, `appointments.reason_for_visit`, the goals tables,
   and the emergency card in a browser's `localStorage`. **This is the largest
   remaining gap** and is not fixable with application code alone.
3. **The dev database holds a real email address.** Either treat that database
   as containing real PII or clear it.
4. **No token revocation and no refresh flow.** The token is also at rest on the
   device between page loads, so a compromised device yields a live session as
   well as a live process.
5. **Signup discloses whether an address is registered.** Kept deliberately.
6. **The rate limiter is per-process and in-memory.** Two workers mean two
   budgets. Put a real limiter at a reverse proxy.
7. **Nothing writes an access log or an audit trail of reads.** No record of who
   read which record — normally a requirement wherever the BAA question is asked.
8. **The mobile build tree has 6 known-vulnerable dev dependencies**, down from
   43 via `overrides` in `mobile/package.json`. The remainder is one chain
   ending at `image-size`, which **has no fixed release at all** — every
   published version sits inside the advisory range — and clears only with the
   React Native upgrade. ⛔ The overrides are verified against `npm test` and
   `expo export --platform web` **only**; anyone doing a native build should
   expect to re-check them against `expo prebuild` and EAS.
9. **A dev-only classification log exists** (`triage_log.py`, flag
   `TRIAGE_LOG_CLASSIFICATIONS`). It writes descriptions and follow-up answers
   to the application log, which this file otherwise forbids. Off by default,
   and it refuses to run when `ENVIRONMENT=production`. ⛔ It is for **synthetic
   input only** — switching it on anywhere a real user has typed into the app
   would be a reportable data-handling failure, and the production check guards
   one environment name, not you.

⛔ **None of this makes the app safe to put in front of real patients.** The
release blockers — clinical sign-off on the triage instrument, legal sign-off on
medical-device status, a BAA with every vendor, encryption at rest — are
unchanged by any of these fixes. What changed is that the app is no longer
trivially breakable by someone who has read its source or joined its Wi-Fi.

## Where the detail lives

Read the relevant file before changing that area. Each carries the reasoning,
the measurements, the rejected alternatives and the bug history behind the
rules above.

| File | Covers |
|---|---|
| `docs/triage.md` | the release blocker in full, the two-layer architecture, `deduction.py` and the free endpoint, follow-up questions, both measurement harnesses and the reported under-triages, emergency routing, concept combinations, the phrase-matching bug history |
| `docs/medical-content.md` | MedlinePlus retrieval, `search_terms.py` and why each rule exists, `names_match`, the measured accuracy, the NLM BAA position |
| `docs/symptom-picker.md` | the four rules the vocabulary is built on, why it runs on the device, the separator as a safety property, and why a picked phrase weighs the same as a typed one |
| `docs/health-goals.md` | what the 2026-09-12 removal deleted, the structuring checks, the schedule, ambition bounds and `WEEK_SHAPE_BY_COMPLEXITY`, `goal_evidence.py`, goal editing, the endpoint split and the Groq shortcut |
| `docs/health-goals-prompt.md` | prompt reasoning and the reviewer's open questions |
| `docs/mutation-testing.md` | the two mutation checkers, the rules each covers, and the four tests that were green for the wrong reason |
| `docs/accessibility.md` | why `accessibilityState` is dropped on web, the seven call sites, and how the test holds the rule |
| `docs/appointments.md` | NPPES, distance computation, location per platform, identity pass-through, the gated booking path |
| `docs/appointment-booking.md` | the option analysis for real booking |
| `docs/medication-reminders.md` | dose-schedule phrase lists, delivery per platform, arming, refill forecasting |
| `docs/label-scanning.md` | the two OCR engines, the parser rules, the corpus and the two defects it found |
| `docs/emergency-card.md` | storage per platform, the mirrored medication list, the palette exception, the rejected lock-screen widget |
| `docs/security-posture.md` | auth, tokens, session persistence, CORS, headers, transport, and all nine closed findings with their fixes |
| `docs/deployment.md` | the Render blueprint, the procedure, the failure modes, what publishing changed |
| `docs/visual-design.md` | the visual direction, the responsive breakpoints, the home-screen reshuffle |
| `docs/free-model-setup.md` | configuring a local or hosted model endpoint |
| `docs/brand-guidelines.md` | the brand work |

⛔ **When you move a rule into this file or out of it, move the whole rule.** A
fence that survives only in a doc is a fence the next agent will not read.

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
