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
| 2026-09-22 | asked by name to approve applying `docs/proposed-emergency-routing-2026-09-22.patch` to `emergency.py` and `rules_triage.py` and building offline emergency screening — "i approve" | that patch and that feature. Applied 2026-09-22, with one narrowing of its own new stroke pattern (a side is required) after it fired on every frozen shoulder in the corpus. |
| 2026-09-22 | shown eight named decisions for the care-orchestration work (triage reads conditions/allergies and may only raise a tier; a fourth level "see a clinician soon"; skip the model on a red flag and add one-tap 988; a user-marked medication history that says "not marked", never "missed"; trends of the user's own better/same/worse check-ins; user-entered clinical targets and readings; the profile on the server with column encryption; a notice that web dictation goes to the browser's speech service) — "approve all 8" | those eight changes, built phase by phase. **Not** merging or deploying. The skip-the-model edit to `triage.py` was refused by the agent's permission classifier, then allowed by the owner in conversation ("i allow triage edit") and applied: the model is never consulted on a red flag. |

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

## Where the detail lives

⛔ **This file has to stay small enough to be read in full.** Over the size
limit it is truncated, and what gets truncated is the bottom — which is where
the fences are. That has happened twice: 211,000 characters, then 90,000 after
a first restructure. Both times the reasoning moved into `docs/` and the rules
stayed here.

**What stays here is what an agent must not miss: the scope, the data rules,
the fences, the release blockers, and the hard ⛔ rules per feature.** What
moved is *why* each rule exists. ⛔ **Read the reference document for a feature
before changing that feature** — the rules below are conclusions, and several
are one careless reading away from their opposite.

⛔ **Do not grow this file back.** A new feature gets its ⛔ rules here in a few
lines and its reasoning in `docs/`. If a section here passes roughly a screen
of text, it belongs in a reference document with a pointer.

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
| `docs/symptom-history.md` | reading back stored assessments, the verbatim visit summary, what leaves the device, consent |
| `docs/check-ins.md` | the day-later check-in, why it is not a triage input, storage, sign-out, arming |
| `docs/proposed-spanish-red-flag-phrases.md` | Spanish red-flag phrases proposed for the fenced list, not applied, and the questions only a clinician and translator can answer |
| `docs/care-profiles.md` | records kept for someone else: the name-only table, ownership, cascade, the banner, arming for everyone |
| `docs/emergency-card.md` | storage per platform, the mirrored medication list, the palette exception, the rejected lock-screen widget |
| `docs/security-posture.md` | auth, tokens, session persistence, CORS, headers, transport, and all nine closed findings with their fixes |
| `docs/deployment.md` | the Render blueprint, the procedure, the failure modes, what publishing changed |
| `docs/visual-design.md` | the visual direction, the responsive breakpoints, the home-screen reshuffle |
| `docs/free-model-setup.md` | configuring a local or hosted model endpoint |
| `docs/brand-guidelines.md` | the brand work |

⛔ **When you move a rule into this file or out of it, move the whole rule.** A
fence that survives only in a doc is a fence the next agent will not read.

## ⛔ BLOCKING: symptom intake requires clinical and legal sign-off

`backend/app/core/triage.py` estimates how soon a user should be seen —
EMERGENT, URGENT or SELF_CARE — from free text. **It must not be put in front
of real users until both of the following are signed off and recorded here.**
This is a release blocker, not a recommendation. Full statement, known limits
and the measurement harnesses: `docs/triage.md`.

1. **A licensed clinician** must review the tier definitions, the system
   prompt, the deterministic red-flag lists, and a corpus of real
   classifications. Nothing in this feature was written or reviewed by a
   clinician; the tier boundaries are a software engineer's construction.
2. **Legal counsel** must determine whether this is a regulated medical device
   in each target market. Software that recommends time-critical care from
   symptom input is materially different from reference content, and this
   app's earlier informational-only posture does not cover it. Also
   unresolved: liability for an under-triage, and what the audit trail must
   retain.

⛔ **The measurement harnesses do not lift this.** `triage_eval/` scores 122
cases and `common_illness/` scores 10,000, both at 100% agreement and 100%
safety of advice — but the gold labels are **this app's own documented intent,
assigned by a software engineer**. That is consistency, not a measured
under-triage rate, and no figure from either may be reported as clinical
accuracy. Rule coverage is 59.5%, which is the honest measure of how much of
this instrument is a phrase list rather than an understanding.

**The same review is owed** by `followup.py`, `dose_schedule.py`, the emergency
phrase lists, the picker vocabulary and `PLAN_SYSTEM_PROMPT`. None has had it.

### ⛔ How the safety architecture works — the five properties

Two layers. **The rule layer is the product; the model is an optional
upgrade.** Read `rules_triage.py` and `triage.py` before changing any of it.

**Layer 1 — rules (`rules_triage.py`). Always runs.** No key, no network, no
cost. Explicit phrase lists a clinician can read line by line, in order:
emergency red flags → urgent indicators → recognised self-limiting complaint →
default. Deterministic, which is what a clinical review needs.

**Layer 2 — the model (`triage.py`). Optional.** Consulted only when
credentials exist, skipped silently otherwise. Two interchangeable
implementations: the agentic `deduction.py` loop when `LLM_BASE_URL` +
`LLM_MODEL` are set, otherwise a one-shot Anthropic call. A missing key
degrades quality; it does not break the feature.

Five properties hold, each asserted by tests and each probed by
`backend/scripts/mutation_check.py`:

1. **SELF_CARE must be positively earned.** It needs a match against a
   recognised self-limiting complaint *and* no escalating modifier. Anything
   unrecognised resolves to URGENT. Not understanding a description is not the
   same as it being harmless — the single most important rule here.
2. Emergency red-flag screening runs **first** and sets a floor of EMERGENT.
3. Neither layer can **lower** the other's tier. They reconcile with `max()`.
4. The displayed reasoning never argues for a lower tier than the one shown.
5. Failure is **never** SELF_CARE. A model outage falls back to the rule tier.

**Adding a rule:** add the phrase to the right list, add a test, and remember
the lists are lay language — people write "my face is drooping", not "face
drooping". Match both word orders. ⛔ These are fenced modules. Every past edit
to them was individually approved by the owner in conversation, and each
approval is recorded in `docs/triage.md`.

### The AI reads the tier back — `app/core/interpretation.py`

Asked for on 2026-09-19: the model should be half of this feature rather than
an invisible upgrade, "interpreting the layer and giving further information on
the risk level". It writes a short plain-language explanation of the tier the
rules produced.

- ⛔ **It runs after the tier is final and cannot change it.** It is called
  from `api/intake.py` with the assessment already built, `Interpretation` has
  only `text` and `model_id` — no tier, score or confidence — and a test
  asserts no fenced triage module imports it. `_reconcile` is still `max()`
  over the rules and the classifier, untouched.
- ⛔ **Never on EMERGENT.** `should_interpret` refuses that tier, for the same
  reason MedlinePlus topics are not attached there: guidance to call 911 must
  not wait behind a model round trip.
- ⛔ **Checked, not trusted.** A reassurance phrase under a tier above
  SELF_CARE is dropped (the deterministic half of property 4), a named
  condition is dropped at any tier, and an over-long answer is dropped. The
  checks are lexical and cannot be a guarantee — what bounds them is that this
  is commentary beside a tier, never the tier.
- ⛔ **Rendered beside the reviewed reasoning, never instead of it**, under its
  own heading, attributed to the model, and disowned in as many words. Merging
  the two would leave nobody able to tell which sentences a reviewer signed off.
- **Failure is silence.** No key, an outage, or a rejected answer all return
  `None` and the screen is exactly what it was before this existed.
- ⛔ **The key was NOT made a hard requirement**, which is the one half of that
  request not built. Making an assessment fail without a model would mean an
  outage withholds emergency guidance, inverting "a missing key degrades
  quality, it does not break the feature". Instead the absence is *stated* on
  the result screen. Making it genuinely required is a fenced decision and
  needs its own answer.
- ⛔ **No clinician has read `SYSTEM_PROMPT` here.** Same review as
  `followup.py`, `dose_schedule.py` and `PLAN_SYSTEM_PROMPT`.

### Emergency routing — `backend/app/core/emergency.py` (fenced)

- Screens every query for red-flag language before anything else: cardiac,
  breathing, stroke, bleeding/trauma, anaphylaxis, loss of consciousness,
  self-harm, overdose/poisoning.
- Deliberately **over-inclusive**. A false positive costs a few seconds; a
  miss could cost a life.
- Guidance renders **above all other content**, routes to 911 (988 for
  self-harm), never names a condition or a treatment, and is returned **even
  when MedlinePlus is down**.
- ⛔ The phrase lists **have not been reviewed by a clinician**.
- `symptom_concepts.py` is a two-term combinator for red flags a literal
  cannot express. ⛔ **Exactly three combinations, all read out of existing
  reviewed copy. A fourth is a new clinical claim** and fails
  `test_the_set_of_combinations_is_fenced`.
- `normalize_query` splits lowercase-to-uppercase boundaries and
  `plural_tolerant` allows a trailing s/es — both can only make screening
  **more** sensitive. ⛔ `_VOIDED_BY_PREFIX` (food poisoning) is the only
  narrowing in the file; do not add an entry there to quieten a false positive.
- The general "When to see a doctor" copy is deliberately non-specific.
  Condition-specific criteria would be clinical content this app may not author.
- **Three passes added 2026-09-22**, all running only after the literals and
  the combinator and all able only to add guidance: lay phrases merged into
  existing categories, number-aware `_PATTERN_RULES`, and a last-pass
  `_CORRECTIONS` table (misspellings, apostrophe-less contractions) that never
  reaches the self-care list. Numeric durations ("for 5 days") now void
  SELF_CARE in `rules_triage.py`.
- ⛔ **Measured honestly: a phrase list fixes the phrases you have seen.** On
  the probe the additions were written from, emergencies caught went 5/39 →
  36/39. On the blind set frozen before any change (`HELDOUT`), 14/39 →
  **15/39**. Do not report the first number without the second, and never
  add a phrase because a HELDOUT case missed — write a new blind set instead.
  `tests/test_triage_heldout.py` holds both floors.
- ⛔ The phone screens offline with an export of this file — re-run
  `scripts/export_emergency_rules.py` after any change, or
  `test_emergency_export.py` fails.

## The rules, by feature

Conclusions only. ⛔ Read the reference document before changing any of these.

### Medical content — `docs/medical-content.md`

- **The app never authors medical content.** All symptom and condition text
  comes from MedlinePlus (NLM), rendered **verbatim** — never summarised,
  paraphrased, shortened or re-sectioned. Always carry `source_name` and the
  link. If the source is down, show an error; never fall back to generated text.
- ⛔ Do not extract "causes", or any other clinical category, out of a summary.
  A bulleted list there is sometimes causes, sometimes symptoms, sometimes
  treatments, and relabelling one invents a clinical claim.
- ⛔ **Related reading is gated off** (`MEDLINEPLUS_TOPICS_ENABLED=false`) and
  must not be switched on until a clinician has ruled on how topics are
  chosen. While off, no MedlinePlus request is made at all.
- A topic is shown only if a name the source gives it contains a word the user
  wrote (`names_match`). ⛔ Non-matching topics are dropped, never reordered —
  ranking health topics by relevance is a clinical judgement this app may not
  make. Known limit: the filter is lexical, so "my head has been pounding"
  still returns "Head and Neck Cancer". That is why the feature is gated.
- `search_terms.py` reduces free text to at most three keywords. Retrieval
  only — it chooses which article to fetch and never alters displayed text.
  Its rules exist because of measured wrong answers; re-measure rather than
  reason about a change.
- **Vendor / BAA:** searches go to `wsearch.nlm.nih.gov` as a **GET with the
  term in the URL**. No BAA is in place and NLM does not sign one.

### Symptom picker — `docs/symptom-picker.md`

`mobile/src/services/symptomVocabulary.ts`, 202 lay phrases. ⛔ **This is the
largest body of app-authored clinical language in the app and no clinician has
read it.** Four rules, each tested:

1. ⛔ **Symptoms only, never conditions.** A menu of diseases has the user pick
   the one they think they have — the app diagnosing by proxy.
2. ⛔ **No severity on any entry, ever.** Urgency is decided once, downstream.
3. ⛔ **Relatedness is anatomical, never clinical.** `area` says which part of
   the body a phrase is about, never which symptoms occur together.
4. ⛔ **Never ranked by seriousness.** `AREAS_IN_BROWSE_ORDER` is not a ranking.

- ⛔ It runs on the device and makes **no network call**. An autocomplete is a
  GET with the user's health text in a query string, forbidden here.
- ⛔ Picked phrases are joined with a `". "` separator
  (`merge_selected_symptoms`) — a feature whose job is assembling a list must
  not manufacture the glued-list bug. A picked red-flag phrase reaches
  emergency screening exactly as a typed one does.
- **Typing is optional**; either typed text or a picked phrase is enough, and
  neither is still refused client-side and in `_at_least_one_input`.
- ⛔ **Every offered phrase must be screenable.**
  `backend/scripts/check_picker_coverage.py` runs every label through the real
  rule layer, keyed on entry id and never on the label. A phrase the app
  offers and then cannot read is worse than one it never offered — that was
  true of ten entries, seven of them already shipped.
- ⛔ **The picker is painted from `useDomain()`, never `colors.accent`.** Every
  other control on the Symptoms screen reads the domain and comes out Symptoms
  blue; the picker alone hard-coded the `today` teal, so the one block a person
  interacts with fought the band above it. A test asserts it, against the
  source with comments stripped. ⛔ Still never a safety family.
- ⛔ **Body areas are a menu, not chips** (2026-09-19). They render as
  full-width rows and opening one replaces the list. Drawing an area with
  `styles.chip` made "head" and "eyes" read as things you could add, and
  leaving the other nineteen on screen buried the phrases you asked for.
  `SymptomChip` and `AreaRow` are each **one component with a varying label** —
  two fixed labels in two places cannot vary, and the accessibility guard
  catches it.

### Symptom history and visit summary — `docs/symptom-history.md`

- ⛔ **A receipt, never an interpretation.** A past assessment is shown as it
  was given and is **never re-assessed**. No trend, count or grouping of
  someone's symptoms — that is a clinical observation. Tested.
- ⛔ **The visit summary is verbatim** (`visitSummary.ts`): the person's words,
  their answers, and medication directions quoted as entered. MedHelp adds
  headings and the tier label marked as a non-diagnostic estimate, nothing
  else. Built on the device; leaves only via the person's own share sheet.
- Audit fields (rule ids, model tier, confidence) are never in the read-back.
- Only consented rows exist; the intake consent sentence says so, and that
  sentence belongs in the reviewer's read of the intake screen.

### Offline emergency screening — `mobile/src/services/emergencyScreen.ts`

- When intake cannot reach the server, the phone screens the same text with
  `src/generated/emergencyRules.json`, exported from `emergency.py` by
  `backend/scripts/export_emergency_rules.py`, and shows the reviewed
  headline and action verbatim above the failure message.
- ⛔ **One copy of the rules, in `emergency.py`.** Never edit the JSON; re-run
  the export. `tests/test_emergency_export.py` fails when it is stale, and
  asserts the copy is verbatim.
- ⛔ **Parity is tested, not assumed**: the phone must return the server's
  category on 252 exported cases and a ~2,800-row common-illness sample.
- ⛔ A fallback that can only add guidance. The server's answer always wins
  when there is one, and an unflagged description is shown exactly what it
  was shown before.

### Check-ins — `docs/check-ins.md`

- One pending "how is it now?" a day after an URGENT or SELF_CARE estimate,
  on the device only. ⛔ **Never offered on EMERGENT.** Tested.
- ⛔ **Not a triage input.** The earlier tier is shown as a fact and never
  sent or used; a "new tier may not be lower" floor would be a fenced change.
- ⛔ The notification is generic (lock screen). Explicit sign-out clears the
  check-in; a 401 must not. Armed by `reminderArming` with the whole set.
- Nothing is added to the person's text when it is prefilled.

### Care profiles — `docs/care-profiles.md`

- ⛔ **`care_profiles` holds a display name and nothing else** — no age, sex or
  relationship. An age would invite a triage input, which is fenced. Tested.
- `profile_id` NULL is the account holder. Ownership is checked only in
  `owned_profile_id`. ⛔ **Intake never refuses over a bad profile id** — the row
  is not stored, the assessment is still returned. Tested.
- ⛔ Deleting a profile deletes its reminders, medications, assessments and
  visits explicitly (SQLite has no cascade), and its card on the device.
- ⛔ `ProfileBanner` on every screen that reads or writes someone's records;
  screens wait for the active profile before loading or saving — except
  intake, which never waits. Notifications say whose medicine it is.
- The emergency card is per person and still makes no network request.

### Health profile and data rights — `app/models/health_profile.py`, `app/api/account.py`

- Conditions and allergies per person (account holder or care profile), free
  text **stored verbatim**, no picker, never checked or corrected — the
  emergency card's rule.
- ⛔ **An empty list means "not recorded", never "none".** Screens say "Not
  recorded"; the visit summary always carries ALLERGIES and CONDITIONS
  sections and says a failed load in words. Tested on both sides.
- ⛔ **The first encrypted table.** `app/core/crypto.py` seals the columns with
  Fernet under a key derived from `DATA_ENCRYPTION_KEY`; outside development a
  missing or short secret refuses to boot. A value that will not decrypt
  **raises** — never reads as an empty allergy list. Never regenerate the key
  on an existing database.
- Triage does not read the profile yet (Phase 3, owner decision 1: it may
  only ever raise a tier).
- `GET /account/export` returns every row the account owns (no password
  hash); `DELETE /account` needs the password again. ⛔ A new table holding
  user rows must join `account._OWNED` — a test fails otherwise.
- `scripts/triage_eval/profile_scenarios.py` is a frozen blind set carrying a
  profile per case. ⛔ Never add a phrase because one of its cases missed.

### Interface language — `mobile/src/i18n/strings.ts`

- ⛔ **Spanish ships switched OFF** (`EXPO_PUBLIC_SPANISH_UI`). Red-flag
  screening reads English only — "dolor de pecho" gets no 911 guidance — so a
  Spanish interface would invite the input the screener cannot read. Do not
  switch it on until Spanish red-flag phrases are approved and in place
  (`docs/proposed-spanish-red-flag-phrases.md`, not applied) and a translator
  has reviewed `es`. Tested.
- ⛔ Only interface chrome is translated. Disclaimers, escalation copy and
  emergency guidance stay as reviewed; a translated safety instruction is a new
  one. A test asserts the table holds none.

### Emergency card — `docs/emergency-card.md`

- ⛔ **Stored on the device and nowhere else.** No endpoint, no table, no
  `fetch`; a test asserts it. It must work with no signal, and the backend has
  no encryption at rest.
- ⛔ `localStorage` on web is deliberate here and is **not** the rule
  `tokenStorage.web.ts` sets. Both halves are tested, so "fixing the
  inconsistency" in either direction fails the suite.
- ⛔ **Nothing on the card is authored, checked or interpreted by MedHelp.** No
  condition picker, no allergy list, no blood-type validation. Nothing reads
  the card either — it is not an input to triage or screening.
- ⛔ **An empty field renders as "Not provided", never as a missing row.** A
  missing allergies row reads as *no allergies*.
- The mirrored medication list is name and dosage only, at most 25 rows and
  300 characters each, and `clearCard()` removes it too.

### Medication label scanning — `docs/label-scanning.md`

- **OCR runs on the device** (Apple Vision / ML Kit, Tesseract WASM on web),
  so no BAA question arises. The native path makes no network call at all; the
  web path fetches its model. ⛔ Do not copy "makes no network call" onto the
  web file.
- ⛔ **Nothing scanned is saved without the user confirming it on screen.**
- ⛔ **Directions are carried verbatim** — never expand BID/TID/QHS. ⛔ **Doses
  are never restated or converted.** ⛔ **Drug names are never corrected
  against a dictionary** — a misread name stays misread so it is visibly wrong.
- Only the four fields the form stores are extracted; raw OCR text is
  discarded inside `readLabel`.

### Medication reminders — `docs/medication-reminders.md`

- ⛔ **MedHelp proposes times. It never sets them.** `dose_schedule.py` is a
  readable phrase list; the suggestion endpoint writes nothing; the user
  confirms on `ReminderEditScreen`. ⛔ **"As needed" / PRN is recognised only
  in order to refuse it** — an interval on a PRN label is a maximum, not a
  schedule.
- ⛔ **A reminder time is a local wall-clock "HH:MM", never a UTC instant.**
- ⛔ **This is not an adherence record.** A past time is "earlier today", never
  "missed". No streaks, no percentages, no "3 of 4 done".
- ⛔ **Local notifications only.** No push token, no Expo push, FCM, APNs or
  Web Push without a BAA decision. ⛔ Never ask for permission without a user
  gesture.
- **Deleting a medication deletes its reminders**, in the endpoint as well as
  by foreign key — a leftover row is an alarm for a medication someone stopped.
- ⛔ **One arming function**: `reminderArming.ts` is the only module that calls
  `scheduleAll`, every arm sends the complete set, and runs are serialised.
  More callers are fine; a partial arm is not.
- Refill alerts: ⛔ `forecast()` **never takes a `frequency` argument** and
  `refill_forecast.py` never imports `dose_schedule` — both tested. ⛔ Keep
  `refill_date` (a date the user wrote down) and `refill_estimate`
  (arithmetic MedHelp did) apart.
- ⛔ Deploying the supply columns needs `scripts/add_medication_supply_columns.py`.

### Appointments and provider search — `docs/appointments.md`

- ⛔ **MedHelp does not book appointments and must not say it does.** Creating
  one writes a row; the provider has never heard of it. `provider_notified` is
  the single source of truth and is never inferred from `status`.
- ⛔ **Do not add a slot picker, a "Book now" button, or a time** until a real
  scheduling integration exists behind it. Availability is not shown because
  no source for it exists.
- ⛔ **Do not flip `delivery_available()` to unlock the UI.** It stands for a
  signed BAA and a partnership, not a feature flag.
- ⛔ **The provider search must never carry health information** — a 5-digit
  ZIP and a care setting from the fixed `CARE_SETTINGS` list, nothing else.
- ⛔ **MedHelp does not rank or recommend providers.** Distance only, always
  rendered with a "~", and a zero is never shown.
- ⛔ **Never ask for location without a user gesture**; `"prompt"` gets no
  error notice. Geolocation needs a secure context and a LAN address is not
  one — report `insecure`, and typing a ZIP is a first-class path.
- ⛔ **Patient identity is pass-through**: `appointments` has no column that
  could hold one, `AppointmentOut` never carries it, `__repr__` is redacted,
  and it never goes in a navigation param. ⛔ `provider_locations` has no user
  column and must never gain one.
- The URGENT tier routes here from `IntakeResultScreen`, carrying the
  description as an editable reason for visit. ⛔ That belongs in the clinical
  reviewer's read of that screen.

### Health goals — `docs/health-goals.md`

⛔ **Read that document before touching this feature.** The deterministic
guards were removed at the owner's request on 2026-09-12, so
`PLAN_SYSTEM_PROMPT` is now the *only* thing constraining an authored plan. A
prompt fails open and silently. Two tests pin the removal so it cannot be
quietly undone.

- ⛔ **Every suggestion is labelled and confirmed.** `generated=True` reaches
  the screen as "Suggested by MedHelp"; editing a row clears the label.
- ⛔ **No benefit claims.** Propose the activity and stop — "walk after lunch",
  never "to bring your blood sugar down". Applies to `detail` word for word.
- ⛔ **No medication, no supplement, no clinical target** (weight, blood
  pressure, blood sugar, calories).
- ⛔ **Scale may fill more of the week and may never make a day harder.** More
  rows, more days, more weekly minutes up to the CDC figure already quoted in
  `goal_evidence.py` — never intensity, never a figure to reach.
- ⛔ **Citations are attribution, never assertion.** The model picks an id from
  a closed register and can never write one; an unknown id becomes no
  citation, never the nearest. `EVIDENCE_CAVEAT` travels with every citation,
  and a surface that folds one away renders no publisher, document or
  quotation while closed. ⛔ Nothing that estimates urgency may import the
  register.
- ⛔ **How much of a plan is backed is a count, never a score.** A per-row
  citation cannot say that *nothing* is backed — an absent one renders as
  blank space, which looks like "not applicable" — so the server sends one
  sentence saying how many of its own suggested rows name published guidance.
  No percentage, no grade, no badge, no better-or-worse between plans: the
  register is eight entries of general lifestyle guidance, so a knee rehab or
  a blood-sugar goal is unbacked by construction and is not a worse goal.
  ⛔ It counts `generated` rows only — calling a `structure` row unbacked
  would describe the person's own quoted words as MedHelp's suggestion.
- ⛔ **A `structure` row must quote the person** — `source_phrase` has to occur
  in the submitted text, no digit may appear unless they wrote it, and it
  carries no clock time and no detail. Suggested rows are exempt by
  construction, which is the weaker side of the asymmetry.
- ⛔ **Never add a progression engine. Never add a second model to review the
  first.** A refusal returns a code, never prose. Failure is never a plan.
- ⛔ **Not an adherence record.** No streaks, percentages or "3 of 4 done".
- Emergency screening runs first in `api/goals.py`, before the model.
- Editing: rows are matched by `id` so ticks survive; an id not on the goal is
  a 400. ⛔ The editor proposes nothing and `description` is not editable.
- `GOALS_LLM_*` exists so pointing goals at a hosted provider does not also
  start sending **symptom descriptions** there. ⛔ The Groq key shortcut is
  read in `goals_endpoint()` and nowhere else.
- ⛔ Deploying the schedule columns needs `scripts/add_goal_schedule_columns.py`.

### Security posture — `docs/security-posture.md`

- **`JWT_SECRET_KEY` is the whole of authentication.** No usable default;
  outside development a weak key is a refusal to boot, inside it is replaced
  per process.
- Algorithm fixed at HS256 **in code**, not configurable. `iss`, `aud`, `typ`,
  `exp` and `iat` are verified and `strict_aud` is on. ⛔ There is still no
  revocation.
- ⛔ **Do not move the browser's token to `localStorage`.** `sessionStorage`
  ends with the tab, which is what should happen on a shared computer. Native
  uses the keystore, this-device-only. A 401 clears the store in all three
  request paths.
- ⛔ **Symptom intake is deliberately not rate limited.** A 429 on
  `/intake/assess` is a refusal to screen someone describing chest pain.
  Sign-in is limited, per process and in memory.
- CORS is an explicit allowlist, credentials off, wildcard refused outside
  development. ⛔ Its dev LAN regex mirrors `mobile/src/services/baseUrl.ts` —
  keep the two in step.
- Every response carries `nosniff`, `DENY`, `no-referrer`, `default-src
  'none'` and `Cache-Control: no-store`. `/docs` is development-only.

### Deployment — `docs/deployment.md`

- ⛔ Deploying was approved **once**, for this demo, on 2026-09-02. It does not
  authorise a second deployment, a custom domain, merging to `main`, switching
  on `MEDLINEPLUS_TOPICS_ENABLED`, setting `TRIAGE_LOG_CLASSIFICATIONS`, or
  flipping `delivery_available()`. **Ask again.**
- Two Render services, not one: the API's `default-src 'none'` would stop the
  web bundle loading. `EXPO_PUBLIC_API_BASE_URL` is inlined at build time, so
  renaming the API service needs the web service **rebuilt**, not restarted.
- Tables come from `scripts/create_missing_tables.py`. Alembic is not wired
  up, so ⛔ **a column added to an existing model still needs a hand-written
  script.**

### Visual direction and layout — `docs/visual-design.md`

- ⛔ **The reviewed safety colours did not move.** The `emergency*`, `notice*`,
  `error*` and `success*` families are byte-for-byte fixed. Do not restyle a
  safety family to match a direction.
- ⛔ **Set `fontFamily`, never `fontWeight` or `fontStyle`** — each weight is a
  separate file. Import font faces by their per-weight subpath.
- One filled action per screen (`PROMINENCE_LEVELS`). ⛔ The emergency palette
  is exempt: "Call 911" stays filled wherever it appears.
- ⛔ **A screen that sets `headerShown: false` owns its own way back.** A
  browser has no back gesture. `navigationReachability.test.ts` holds both
  directions of reachability — that a route can be reached, and that you can
  get out of it.
- ⛔ **Never put numbers about the user's health in a panel or tile.** No "3 of
  4 taken today" — MedHelp does not know whether a dose was taken.
- Which screens show `DisclaimerBanner` is fenced; adding it to a new screen
  is a reviewer's call, not a layout one.

## Open data-handling findings

Full text, including the seven closed with tests: `docs/security-posture.md`.

⛔ **Still open — each needs a call before the app holds real user data:**

1. The app connects to Postgres as the `postgres` superuser.
2. **Almost nothing is encrypted at rest.** Only `health_profiles` is
   (column-level, `app/core/crypto.py`). `medications`, `intake_assessments`,
   `medication_reminders`, `appointments.reason_for_visit`, the goals tables,
   and the emergency card in a browser are still plaintext. The largest
   remaining gap; `EncryptedJSON` is the tool for closing it table by table.
3. The dev database holds a real email address. Synthetic data only.
4. No token revocation and no refresh flow.
5. Signup discloses whether an address is registered (kept deliberately).
6. The rate limiter is per-process and in-memory.
7. Nothing writes an access log or an audit trail of reads.
8. The mobile build tree has 6 known-vulnerable dev dependencies, all in
   Metro's `image-size` chain, which has no fixed release.
9. A dev-only classification log exists (`TRIAGE_LOG_CLASSIFICATIONS`), off by
   default and refusing to run in production. ⛔ Synthetic input only.

⛔ **None of this makes the app safe to put in front of real patients.** The
release blockers above — clinical sign-off on the triage instrument, legal
sign-off on medical-device status, a BAA with every vendor, encryption at rest
— are unchanged by any of it.

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
