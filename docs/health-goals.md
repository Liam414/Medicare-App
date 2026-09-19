# Health goals

Detail behind CLAUDE.md, section "Health goals". Prompt reasoning and the reviewer's open questions are in health-goals-prompt.md; the mutation-testing work that verifies these rules is in mutation-testing.md.

## Health goals (implemented)

A person writes down a goal, confirms the plan and daily schedule MedHelp
proposes for it, and ticks the activities off. Reasoning and the reviewer's
open questions: `docs/health-goals-prompt.md`.

### ⛔ The blocking was removed on 2026-09-12. Read this first.

**MedHelp now proposes a plan for any goal a person types, including a medical
one, and no deterministic check screens what it proposes.** Two things were
deleted at the repository owner's direct request, asked for in conversation on
2026-09-12 — "remove the feature that blocks health plans and make it so the
section creates a plan and daily schedule for the health goal the user
inputs":

- **The `MEDICAL_GOAL` refusal**, and `WOULD_REQUIRE_AUTHORING` with it. These
  were how "lose weight", "stop my headaches" and "get my blood pressure down"
  reached the person as a refusal instead of a plan: `structure` ran first,
  and a `MEDICAL_GOAL` answer short-circuited before the planner was called.
  The order is now the plain one — the planner runs first, for everything.
- **`_FORBIDDEN`**, the phrase-list veto in `core/goal_structuring.py`. It
  held "calorie", "weight", "blood pressure", "dose", "hiit" and about sixty
  more, and one match anywhere discarded the *whole* plan. It is what made a
  health goal unanswerable in practice, because the goal could not be planned
  for without using the words it watched for.

⛔ **Be clear-eyed about the cost rather than reassured by what is left.** The
only thing now constraining an authored plan is `PLAN_SYSTEM_PROMPT`. A prompt
is an instruction that is usually followed; a phrase list was a check that
always ran. A prompt fails open and silently. This is a materially weaker
position than the one this file described before, and it was chosen
deliberately — not arrived at by drift.

Two tests pin the removal so it cannot be quietly undone
(`test_the_codes_that_blocked_a_health_goal_are_gone`,
`test_the_forbidden_phrase_veto_is_gone`). Reinstating either is a failing
suite and a conversation, not a tidy-up.

### What still holds, and may not be removed

1. **Every suggestion is labelled and confirmed.** `generated=True` reaches
   the screen, the row reads "Suggested by MedHelp — edit it or remove it",
   and editing a row's text clears the label because it has become the
   person's own. Nothing is saved until they press save. ⛔ Never render a
   suggested row without that label.
2. **No benefit claims.** `PLAN_SYSTEM_PROMPT` still forbids explaining what
   an activity will do for the person — propose the activity and stop.
   "Walk after lunch", never "walk after lunch to bring your blood sugar
   down". A benefit claim is the app authoring a health claim, which is the
   line this feature is still built around, and it is the easiest one to
   break now that the veto is gone.
3. **Still no medication or clinical targets.** The prompt refuses a dose, a
   supplement, a change to anything prescribed, and a target figure for a
   weight, blood pressure, blood sugar or calorie count. These are a
   clinician's call, and refusing them is not the same as refusing to plan.
4. **Emergency screening runs first and is untouched.** `api/goals.py` calls
   `screen_for_emergency` before the model, and its guidance is returned
   alongside whatever else happened.
5. **The `structure` fallback is unchanged**, checks and all. Where the
   planner fails, the person's own quoted words come back rather than an
   empty editor — the same rule as a model outage in triage never being
   SELF_CARE.

**Their own words are the fallback, not the main path.** `structure` still
reads quotable activities out of the text and every row it produces must quote
them — the check below. It now runs only when the planner returned nothing.

#### ⛔ The prompt's length and its order are properties too

Measured 2026-09-13 while adding the ambition sections: `PLAN_SYSTEM_PROMPT`
has gone **6,019 characters at the start of this branch → 11,957 → 16,366**
(~4,100 tokens). Most of a tripling, read by whatever free model a deployment
has configured. **A longer prompt is not a stronger one** — instruction
following degrades with length, and what degrades first is whatever sits
furthest from the question. Here that would be the rules about medication,
clinical targets and benefit claims.

Two tests hold the shape:

- `MAX_PLAN_PROMPT_CHARS` (18,000) is a tripwire, not a validated limit. It
  makes the next big addition a decision rather than a drift. Raising it should
  come with a reason and a `goal_plan_eval` run either side.
- ⛔ **The absolute constraints bracket the ambition material, at 18% and 77%
  through.** Left to itself, raising how much of a week a plan may fill would
  have put new ambition-raising text in front of a constraint list already
  three-quarters of the way down — the worst arrangement available. So
  `WHAT SCALE MAY NEVER CHANGE` restates weight, blood pressure, calorie
  targets and "through pain" where the ambition is introduced. **The
  duplication is the point, not waste**, and a test fails if either copy goes.
  Verified by deleting the early copy and watching it fail.


### The plan carries a daily schedule

Each proposed activity comes back with `days` (which days of the week) and
`time_of_day` (a local wall-clock `"HH:MM"`), added 2026-09-12. That is the
half the person came for: a plan with no schedule is a list.

- ⛔ **A time is a local wall clock, never a UTC instant** — the same rule as
  `medication_reminders`. Eight in the morning means eight in the morning
  wherever the person is; storing an instant would move their plan when they
  travelled.
- **`cadence` and `times_per_week` are derived from `days`**, in
  `_validate_plan` and again on the editor when the person re-ticks days. The
  model is not asked for them. A plan therefore cannot say "three times a
  week" beside four ticked days, and the old failure where a weekly cadence
  arrived without its count and discarded the whole plan is gone by
  construction.
- **A time is refused, never guessed.** `8am`, `0800` and `8:00` are rejected
  by both the core module and the schema, exactly as `dose_schedule.py`
  rejects them: "8" could be either end of the day.
- **A row with no usable day list or time discards the whole plan.** A
  silently half-scheduled plan is harder to notice than an absent one.
- **A `structure` row carries no schedule at all**, deliberately. That path
  may only rearrange words the person wrote, and a clock time is digits
  nobody wrote — the same rule that stops it inventing a duration. The person
  sets their own days and time on the editor.
- **An activity with no days is not treated as daily.** It is unscheduled,
  reads "Whenever you choose", and is never marked "Due today" — nobody chose
  those days. It stays tickable, because a tick is a note the person makes
  for themselves.
- ⛔ The goals screen marks due rows **"Due today", not "Today"** — the tab
  bar already has a tab called Today, and one word meaning two things on one
  screen is worse for a screen reader than a longer label.
- ⛔ Still **not an adherence record**. The marker says which day a row falls
  on; it never counts, scores, or says how many are left. No "2 of 3 today".
  Asserted by a test.

**Deploying this needs the column script.** `days` and `time_of_day` went onto
the existing `goal_activities` table, so run
`scripts/add_goal_schedule_columns.py` once against any database created
before this change or `/goals` returns 500s. It is idempotent and the Render
start command runs it. Neither column is backfilled with a guess: a goal saved
before this does not acquire an 08:00.

### The same plan came back for every goal (FIXED 2026-09-13)

Reported by the repository owner: *"I said I want to lose a hundred pounds, and
I said I want to lose one pound, and it gave me the same plan"*, and that the
plans were vague generally. Two causes, and the first is the generic-title bug
above repeating itself one section further down the same prompt.

- **`WHAT TO PROPOSE` handed the model the plan.** It illustrated the shape of
  a row with "Walk after lunch", "Go to bed at the same time each night" and
  "Cook dinner at home" — and those three came back *as* the plan, for goals
  that were not about walking, sleep or cooking. ⛔ **An example in a prompt is
  a suggestion, not an illustration.** That has now cost this feature two bugs,
  so the copied rows are named as the failure rather than offered, exactly as
  the generic titles were.
- **The prompt never asked the model to read the goal.** It said at length what
  a good plan looks like in general and nothing about what makes this goal this
  goal. It also said to "assume the person is starting from nothing", which is
  a uniform floor: if everybody starts in the same place, everybody gets the
  same first step. Three sections replace that — `READ THE GOAL BEFORE YOU PLAN
  IT` (the specifics to pick up, and the requirement to say them back in the
  rows), `SCALE CHANGES THE PLAN, AND IN ONE DIRECTION ONLY`, and `BEFORE YOU
  ANSWER, READ THE PLAN BACK` (cover the goal; if you cannot tell what it was
  from the rows, it is a template).

⛔ **Scale may change a plan's shape and may never make it harder.** More rows,
different days and a longer rhythm are planning decisions. A bigger amount, a
longer session, more intensity, or a figure to reach are a clinician's. The
prompt says so in as many words and `test_scale_changes_the_plan_but_may_never_make_it_harder`
pins it, because "answer a bigger goal differently" is one careless reading
away from "answer a bigger goal harder" — and the prompt is the only guard
left on this path.

**The planner no longer decodes greedily.** `llm.chat` gained an opt-in
`temperature` **defaulting to 0**, so ⛔ **triage is untouched and must stay
untouched**: a tier that moved between two submissions of the same sentence
could not be reviewed, and that property is worth more than variety.
`goal_structuring.PLAN_TEMPERATURE` is 0.7 and is the only caller passing
anything — the `structure` fallback stays greedy too. Greedy decoding on a
prompt that did not discriminate collapses onto the single most probable plan,
which is the most generic one.

#### It is measured, not asserted — but it has not been measured yet

`backend/scripts/goal_plan_eval/` runs a corpus of synthetic goals built as
**contrast pairs** — two goals a plan is obliged to answer differently,
including the reported one — and reports the share of rows shared across goals,
how far each pair's halves overlap, which titles were reused, and how many
plans contain any word of their own goal.

    cd backend
    python scripts/goal_plan_eval/measure.py --show
    python scripts/goal_plan_eval/measure.py --strict

⛔ Unlike `triage_eval`, which runs an offline phrase list, **this one calls a
live endpoint and costs whatever that endpoint costs**. With none configured it
says so and exits rather than reporting a zero. It measures *responsiveness*
and says nothing about whether a plan is safe, achievable or good.
`measure()`'s arithmetic is unit tested offline in
`tests/test_goal_plan_eval.py`, including the reported pair coming back
identical and registering as a 100% overlap.

#### The BEFORE numbers, taken against the deployment on 2026-09-13

Collected with `--api` against `medhelp-api-as615.onrender.com`, which runs
`main` — so these measure **the bug**, not the fix. All 16 goals planned.

| | before |
|---|---|
| rows shared across goals, exact | 9.5% |
| plans using any word of their own goal | **53.3%** (threshold 70%) |
| `weight-scale` pair overlap (the reported one) | **33%** |
| `quit-scale` pair overlap, counting rewordings | **80%** |

The run is committed at
`backend/scripts/goal_plan_eval/runs/2026-09-13-before-deployed-main.json` and
`--load` re-measures it without calling anything, which is what makes the
comparison an actual comparison rather than two runs of different code against
different quotas.

⛔ **THE FIRST METRIC REPORTED THE REPORTED BUG AS ABSENT.** Exact row matching
scored the two smoking goals at **0%** overlap while both plans were walk /
water / breathing break / call a friend, reworded. `near()` therefore matches
on **containment of the shorter row**, not Jaccard: Jaccard punishes a row for
carrying extra context, which is precisely how a template row disguises itself.
That took `quit-scale` from 0% to 80%, and `--strict` reads the soft figure.
A first attempt at it folded "walk the dog" into "walk around the office for
five minutes" — two shared tokens, one of them "the" — so a fold also needs two
shared non-function words.

⛔ **The AFTER numbers have not been taken**, because they need this branch
deployed and the branch is not deployed. Until then the fix is a prompt change
reasoned about rather than counted, which is the exact thing the title-bug note
above says not to settle for.

**What the baseline shows qualitatively**, and it is sharper than the numbers:
the planner is responsive whenever the person **names the activity** —
`sleep-baby` got phone-and-scrolling rows, `meds-routine` got "place tablets
next to toothbrush", `knee-injury` got seated knee bends. It collapses to the
template exactly where it has to **originate** one: both weight goals, both
smoking goals, and "I have no energy" all came back as some ordering of stretch
on waking / glass of water / walk after lunch / screens off before bed. That
split is the argument for the prompt change: the old prompt had plenty to say
about what a good plan looks like and nothing about reading the goal.

⛔ **A live finding that is not about this bug.** The first baseline attempt
lost **8 of 16 goals** to "MedHelp is busy right now" at four seconds apart.
That is the Groq free-tier quota, and it means a person trying two or three
goals in a minute is told the app has nothing to suggest about half the time.
The `Busy` path is working as designed; there is simply not much quota behind
it. Separate decision, separate fix.

### Detailed, sourced, and sized to the goal (2026-09-13)

Asked for directly: *"very detailed and proven plans to solve or accomplish
what the user wants to achieve; these plans should take into account for the
complexity and difficultness of the goal"*. Three things, built three ways,
because they fail differently.

#### 1. Detailed — every row says how, in `detail`

A row is the instruction; `detail` is one or two plain sentences saying how to
do it on the day, in this person's life. Required of every suggested row; a row
without one discards the plan, the same as a row without a schedule.

⛔ **It says how, never why.** "No benefit claims" is the rule that survived the
2026-09-12 removals and it applies to the detail word for word — the moment a
sentence explains what an activity will do for somebody's body or illness, the
app is authoring a health claim. The length cap (`MAX_DETAIL_CHARS`) is a crude
proxy for that and is honest about being one: long enough to be an article is
long enough to have started explaining.

⛔ **`structure` rows carry no detail**, the same rule that keeps a clock time
off them. That path may only rearrange words the person actually wrote.

#### 2. Proven — `core/goal_evidence.py`, attribution and never assertion

The only form of "proven" this app may ship: a row is attributed to a
**published recommendation from a named public health body, quoted verbatim,
with a link**. The register holds eight entries, every one fetched from the URL
beside it and reproduced exactly. It is the MedlinePlus rule applied to a new
surface — render source text verbatim, always carry attribution and the link,
never paraphrase.

- ⛔ **A citation claims one thing: that this KIND of activity is the subject of
  this published recommendation.** Not that the plan works, not that the
  publisher endorses it, not that it applies to this person, not that anyone
  reviewed it. `EVIDENCE_CAVEAT` in `api/goals.py` says exactly that and travels
  with **every** citation; the client drops a citation that arrives without it
  rather than showing a bare one. Tested on both sides.
- ⛔ **The model picks an id from a closed list and can never write a citation.**
  No URL, publisher, quote or study field exists anywhere in the tool schema,
  and `additionalProperties` is false. A model asked for a citation invents a
  plausible one; a model asked to choose from eight ids either chooses or does
  not.
- ⛔ **An unknown id becomes no citation, never the nearest one.** Same rule, and
  the same reason, as the label parser refusing to snap a misread drug name to
  the nearest real drug: a visible gap beats a plausible error.
- ⛔ **Only the id is stored.** The quotation and link are assembled on the way
  out, so a government sentence cannot go stale in a database row, and a client
  cannot save an attribution the register does not know.
- ⛔ **Rewriting a row drops its citation and its detail.** Both were written for
  the row as proposed; once the person changes what the activity is, nobody has
  checked that the guidance is about it. Keeping it would be MedHelp attributing
  a person's own idea to the CDC.
- ⛔ **Nothing that estimates urgency may read this register.** A test asserts
  `triage.py`, `rules_triage.py`, `emergency.py` and `deduction.py` do not
  import it. It is attribution for a lifestyle activity.
- A sleep-duration entry was **dropped** rather than included: CDC publishes the
  figure as a table cell ("7 or more hours"), so any sentence carrying it would
  have been written here. Entries are whole published sentences or nothing.

⛔ **What this still is not.** Nobody clinically qualified has read
`PLAN_SYSTEM_PROMPT`, the plans, or the mapping from a row to a domain — and the
mapping is made by the model. Real published guidance now sits under the rows,
which is a genuine improvement on a model asserting things; it is not the
clinical review this file has been asking for, and it does not lift any release
blocker.

### Ten minutes a day for a year-long goal (2026-09-13, second report)

Reported by the repository owner, the same day and after the changes above:

> *"I don't trust these goals. I put it, I wanna lose a hundred pounds in a
> year, and basically recommended me to do ten minutes of exercise a day,
> drink water, go to bed on time. I also feel like the strictness and the
> severity of these plans aren't very that effective."*

Two distinct defects, and they need different kinds of fix. It is worth
separating them before reading the rest, because conflating them is how this
would get "fixed" by making plans harder, which is fenced.

- **Unserious size.** A plan present on four days of a year-long attempt is
  not a cautious plan, it is one that did not read the goal. **That is a
  planning failure and is now checked.**
- **Vagueness.** "Drink water" and "go to bed on time" are the habits that fit
  every goal and answer none of them. **That is a prompt failure and is
  addressed in the prompt**, where it can only be asked for.

#### The ceiling on ambition now comes from published guidance, not from us

`PLAN_SYSTEM_PROMPT` used to cap **every** plan at "modest starting points,
not a training programme" and "keep it easy", so a goal meant for an afternoon
and a goal meant for a year were both offered ten minutes. That is where the
reported plan came from, and it was deliberate: MedHelp has no business
deciding how hard anyone should work.

The resolution is that it still does not decide. `HOW MUCH IS ENOUGH` in the
prompt builds the week towards **a figure somebody else published** — the CDC's
150 minutes of moderate activity a week plus muscle-strengthening on about two
days — which is the *same recommendation already quoted verbatim* under these
rows by `goal_evidence.py`'s `aerobic_activity` and `strength_activity`
entries. `test_the_published_figure_in_the_prompt_is_the_one_in_the_register`
pins the two together so there is one copy of the number.

- ⛔ **It is a ceiling to build towards, never a target to announce.** The
  prompt forbids writing "150" into a row and forbids saying what reaching it
  would do for anyone — a figure on a person's screen with a benefit attached
  is the app authoring a health claim, which is the line this whole feature is
  built around.
- ⛔ **Never propose more than it.** Above a published adult recommendation
  there is nothing to appeal to but MedHelp's own judgement about this
  person's capacity, which it does not have.
- **It starts lower by default.** Where somebody said their week is full, said
  they have tried and stopped, described pain, injury or illness, wrote a very
  small goal, or said nothing at all about their time — the plan starts under
  the figure. Only a person who described room gets built towards it.

⛔ **Read `SCALE` as it is now worded, not as it was.** The rule used to be the
flat `NEVER ANSWER A BIGGER GOAL WITH A HARDER PLAN`. It is now split, because
the flat version is what produced the reported plan: it forbade a bigger goal
from buying anything at all.

| A bigger goal may buy | It may never buy |
|---|---|
| more rows | intensity — harder, faster, heavier, through pain |
| more days per row | a figure to reach (weight, BP, blood sugar, calories) |
| more of the day covered | anything under `WHAT YOU MUST NEVER PROPOSE` |
| more weekly minutes, **up to the published figure** | more than the published figure |

*A bigger goal earns a fuller week. It does not earn a harder day.* How hard a
person should push is a clinician's call; how much of their week a plan
occupies is an ordinary planning decision.
`test_scale_may_fill_more_of_the_week_and_may_never_make_a_day_harder` and
`test_the_prompt_still_refuses_every_clinical_decision` hold both halves,
because the prompt is still the only guard on this path and "answer a bigger
goal with more of the week" is one careless reading from "answer it harder".

#### `WEEK_SHAPE_BY_COMPLEXITY`: the half of "sized to the goal" a row count cannot see

`ROWS_BY_COMPLEXITY` bounded how many things a plan contained. Nothing bounded
how much of anyone's week those things touched — so **four rows on one day
each, a plan present on four days out of seven, satisfied "major"**. That is
precisely the reported plan, and five rows would not have improved it.

A **day-slot** is one row on one day; a plan's total is the sum over its rows.
`_validate_plan` now requires that total to match the reading the model
declared, and discards the plan when it does not.

⛔ **The floor and the ceiling count different things, and that is the whole
point.** Two measures of a week disagree in exactly the case that matters:

| | "walk daily" + 3 weekend errands | the reported plan (4 rows, Mon–Thu) |
|---|---|---|
| day-slots | 10 | 4 |
| **days of the week it is on** | **7** | **4** |

A slot floor high enough to reject the reported plan also rejects the first
one — a good answer to a year-long goal — and hands that person an empty
editor. So a **floor counts days touched**, which is literally what "present
on most days" means, and a **ceiling counts day-slots**, because what a
ceiling rules out is total volume. Days touched cannot do a ceiling's job: one
daily habit is on all seven days and is a perfectly good small plan.

| reading | rows | floor: days on | ceiling: day-slots |
|---|---|---|---|
| `small` | 1–3 | — | **14** — no week-long programme for something meant once |
| `moderate` | 3–4 | **2** — not a plan that touches one day | 28 |
| `major` | 4–5 | **5** — a year's work is present most days | 35 |

- ⛔ **It bounds coverage, not effort**, and that distinction is the whole
  design. Coverage is arithmetic this module can perform; effort is a
  clinician's call. A model that reads a goal as major and answers with one
  punishing row still gets past this, exactly as it gets past
  `ROWS_BY_COMPLEXITY`. `test_the_coverage_bands_never_measure_how_hard_a_row_is`
  puts three gentle rows and three gruelling ones on the same schedule and
  asserts the same verdict — it exists so nobody later reads these bands as a
  safety control.
- **Each band has one working end and the other is slack on purpose.** A
  single row on two days is a perfectly good small plan, and a major goal
  answered on every day of the week is not wrong. A floor for `small` or a
  ceiling for `major` would reject real plans to enforce nothing.
- ⛔ **A discard costs the person their plan**, so the bands are wide. They
  catch a plan that ignored the goal's size outright, not one that read the
  goal a notch differently from how somebody else would.
- ⛔ **Read the two tables together, because nothing else does.**
  `ROWS_BY_COMPLEXITY` bounds how many rows; this one bounds what shape of
  week they make. A bound on one that quietly excludes an ordinary plan under
  the other looks like nothing at all from either table, and that has happened
  twice on this change alone — `moderate` shipped for one commit at a slot
  ceiling of 21, silently rejecting four daily habits for a goal about an
  ordinary week; and a slot *floor* for `major` rejected a daily walk plus
  three weekend errands. Both would have been an empty editor for a real
  person. `test_the_bands_reject_only_the_shapes_they_are_meant_to` enumerates
  every (rows × days) the row band allows and asserts exactly which set the
  shape band turns away, so the rejected shapes are a reviewable list rather
  than an emergent property of four numbers nobody compares.
- ⛔ **That enumeration is a uniform grid and real plans are not**, which is
  how the second bug got past it. The uneven cases are written out as their
  own tests
  (`test_a_major_plan_of_one_daily_row_and_a_few_weekly_ones_is_kept`), and a
  new bound needs one too.
- **The cost of the check is swept, not reasoned about.**
  `test_no_plausible_plan_is_rejected_for_a_reason_its_band_does_not_enforce`
  builds every plan from the day-patterns real plans use, at every allowed row
  count — ~74,000 shapes, offline — and asserts each rejection is attributable
  to that band's one working end. As shipped, **94.6% / 99.9% / 94.8%** of
  plausible plans are kept, and every rejection is the intended kind.
- ⛔ **Attribution alone is not enough, and that was checked rather than
  assumed.** Both bugs above were re-introduced to see whether the test
  catches them. Attribution catches the moderate ceiling. It does **not**
  catch a floor expressed on day-slots: set the major floor to 14 days and
  "touched < fewest_days" explains every rejection, because a days floor of 14
  can never be met — so everything is refused and everything is
  'attributable'. The test therefore also asserts each band **keeps** more
  than half of the sweep, and that a floor never exceeds the length of a week.
  With both checks in place each bug is caught.
- **The eval harness gates on the same number**, records `days_touched`
  separately from the per-row counts because one cannot be derived from the
  other, and a test asserts `measure.MAJOR_FLOOR_DAYS` equals the table's.

#### Vagueness is asked for, not checked — and that asymmetry is the honest part

`EVERY ROW HAS TO BE DOABLE WITHOUT DECIDING ANYTHING ELSE FIRST` gives three
tests a row must pass: **checkable** (yes or no at the end of the day),
**located** (it says where, or with what), and **the first move is obvious**
(startable in ten seconds without looking anything up or choosing between
options the plan left open).

The two rows the owner was actually shown — `"drink a glass of water after
waking"` and `"go to bed at the same time each night"` — are named in the
prompt as the failure, not offered as examples. ⛔ **An example in a prompt is
a suggestion, not an illustration**; that has now cost this feature three bugs
(the generic titles, the copied `WHAT TO PROPOSE` rows, and these), so each set
is written in as a thing that came back rather than a thing to aim at.
`test_the_prompt_names_the_reported_template_rows_as_the_failure` keeps them
there.

⛔ **Be clear about what this half is.** A prompt asks and a check enforces, and
there is no deterministic check for vagueness — "drink a glass of water after
waking" is a perfectly concrete row that happens to answer nothing. Telling a
row that fits this goal from a row that fits every goal is a judgement, which
is why this is the half that remains an instruction. A template-row veto was
considered and **not** built: the measured baseline shows the model emits these
when it has to originate a plan, not from a fixed vocabulary a list could hold,
and a blunt phrase veto here is how `_FORBIDDEN` made health goals unanswerable
in the first place.

#### It is measured — on a new axis, and still not run

`goal_plan_eval` now records each plan's `days` and `complexity` and reports
**day-slots per plan**, broken down by the reading, plus `thin_major_plans` —
major goals answered on under fourteen day-slots, which is the reported bug by
name.

- ⛔ **A run that recorded no schedule reports coverage as absent, never as
  zero.** The committed BEFORE baseline predates the field; printing it as a
  mean of 0.0 would read as a finding about those plans rather than a fact
  about the run, and the before/after would compare two different things.
  `test_a_run_that_recorded_no_days_reports_no_coverage_at_all` pins it.
- **Both new figures are gated by `--strict`**, not merely printed.
  `MAJOR_FLOOR_SLOTS` fails a run containing a plan read as major on under
  fourteen day-slots — the reported bug, by name. ⛔ **A metric nobody fails on
  is a metric nobody reads**: the coverage figures were reported and ungated
  when first added, which would have let exactly that plan pass a `--strict`
  run in silence.
- **The prior question is measured too: did the planner read the two goals as
  different sizes at all?** The contrast-pair overlap only sees the failure
  once the ROWS coincide. Four corpus goals now carry a `not_below` /
  `not_above` bound — a year-long, tried-and-stopped goal may not be read as
  less than major; a single-day goal may not be read as major — and a
  violation is both printed and gated by `--strict`.
  ⛔ **Bounds, never gold labels, and only where the goal states its own scale
  in so many words.** The other twelve carry neither, because "is this
  moderate or major" is exactly the judgement this app should not score itself
  on, and a test asserts an unbounded goal can never be reported. Same
  standing as `triage_eval`'s gold tiers: consistency with this file's
  documented intent, assigned by an engineer, not correctness.
- **Vagueness has a crude proxy too**, since it is the half no check enforces:
  `situated_share`, the share of rows that say **when or where** they happen,
  gated at 70%. Rows like "eat better" and "be more active" cannot score.
  ⛔ **Read what it cannot see.** "Drink a glass of water after waking" — one
  of the two rows actually reported — *passes*, because it does name a moment.
  It measures whether a row is placed in a day, never whether it answers the
  goal; that is what `repeat_share` and the contrast pairs are for, and it is
  the same reason no deterministic vagueness check exists in
  `goal_structuring`. A high figure here is necessary and nowhere near
  sufficient; a low one is the finding worth acting on.
  `test_a_concrete_row_that_answers_no_goal_still_counts_as_situated` pins the
  limit so the number is not over-read.
- **Re-measuring the committed baseline reports 54% situated**, which is a
  real finding about the pre-fix plans and consistent with the report. It is
  the only number on this change that exists today.
- ⛔ **The AFTER numbers still have not been taken**, for the same reason as
  the section above: the branch is not deployed and there is no key on this
  machine. Both halves of this change are reasoned about rather than counted
  until somebody runs `measure.py`, and the coverage half is the one where a
  count would actually settle it.

#### The citation is folded away on the screen people open every day

Reported in the same message:

> *"when we do the research to support why the AI is picking these plans, it
> gets too overwhelming in the text… once they've already set the goals, I
> feel like it's a little redundant to include that information right there."*

Correct, and the split is the right one. `GoalCreateScreen` renders the
citation open, because there it is part of deciding whether to accept a row.
`HealthGoalsScreen` — opened every day to tick two boxes — folds it behind
**"Where this comes from"**, per row, closed by default.

- ⛔ **Folded, not dropped, and that is what makes it permissible.** The rule
  in `goal_evidence.py` is that every surface rendering a citation carries
  `EVIDENCE_CAVEAT`. Closed, the screen renders **no publisher, no document
  and no quotation**, so there is nothing to read as an endorsement; opened, it
  renders all four exactly as the editor does. The two tests are a pair and
  must stay one.
- ⛔ **Never put the publisher's name on the closed control.** "CDC ›" would be
  a government name under a MedHelp-written row with no room for the caveat to
  follow it, which is the exact thing the caveat exists to prevent.
- **The detail stays visible.** It says *how* to do the row on the day, which
  is the part that earns its place on a screen someone opens every morning.
  The citation says where the kind of activity came from, which is a question
  you ask once.
- State held per activity in component state, not persisted: which sources
  somebody expanded yesterday is not a preference.
- ⛔ **The open/closed state is said in the accessible label, not only in
  `accessibilityState`.** Found by opening this screen in a real browser with
  the whole suite green: React Native Web **drops
  `accessibilityState={{ expanded }}` entirely** — the rendered control
  carries no `aria-expanded` at all — and `accessibilityLabel` *overrides* the
  visible text for a screen reader. So a reader heard one unchanging label
  while a sighted user watched "Where this comes from" become "Hide where this
  comes from". Same defect and same fix as the goal editor's day buttons.

  The test asserts the **label**, not `accessibilityState`, because asserting
  the latter is exactly what let this through: it passes in jsdom and means
  nothing in a browser.
- ⛔ **The tick itself had the same bug, and it is worse.** `HealthGoalsScreen`
  labelled each checkbox with the activity text alone, so a ticked row and an
  unticked one announced **identically** — on the one screen whose entire
  purpose is ticking things off. Now fixed the same way: the label says
  "ticked off for today" or "not ticked off". ⛔ Never "missed", "skipped" or
  "incomplete", in the label any more than in the visible copy — an unticked
  row means nothing was ticked, and this is not an adherence record. A test
  asserts the forbidden words never appear in the accessible name.


### The structuring rule is checked, not trusted

Every activity read out of the person's own words must carry a `source_phrase`
that occurs in the submitted text, and `core/goal_structuring.py` discards the
*whole draft* if any does not. A model that wants to add stretching to a
walking goal has to quote "stretch" out of text that never contained it.

Four further checks follow the same principle, most importantly that **no digit
may appear in an activity unless the person wrote it** — an invented number is
the likely shape of an invented duration, distance or dose. It is also why a
`structure` row carries no clock time: a time is digits nobody wrote.

⛔ **This applies to the fallback path only.** Suggested rows are exempt from
the quoting and digit rules by construction, since nothing was written to
quote. The veto list used to guard them instead; it was removed on 2026-09-12,
so nothing deterministic guards them now. `_validate_plan` checks shape — a
title, a day list, an `"HH:MM"` — and does not look at content at all.

Rules for anyone extending this:

- **Never add a progression engine.** Nothing may increase a target because a
  week went well; that is authoring, one week at a time, and it is exactly
  what the substring check exists to prevent.
- **Never add a second model to review the first.** A gate whose failure mode
  is a silent pass is not a safety layer. The checks here are deterministic
  for the same reason the triage rule layer is a phrase list a person can read.
- **A refusal returns a code, never a sentence.** The four strings a person
  reads live in `_REFUSAL_NOTICES` in `api/goals.py`, because user-facing text
  in a health app is reviewed text. `core/goal_structuring.py` must never
  return prose.
- **Failure is never a plan.** No endpoint, an outage, or a failed check all
  yield an empty editor plus the server's own sentence. There is no generated
  fallback, for the same reason a model outage in triage is never SELF_CARE.
  Those three are one sentence to the person and three different repairs to an
  operator, so `_discard()` logs **which check** caught a draft — the check's
  name only, never the value that failed it, which is the person's own health
  text. A `source_phrase is not in the submitted text` line means the model
  paraphrased instead of quoting: the check working as designed, and worth
  looking at the prompt only if it fires for everybody.
- **Emergency screening runs first**, in `api/goals.py`, before the model is
  called. A goal box takes "stop feeling dizzy on the stairs" as readily as
  intake does, and guidance is returned alongside a refusal or an outage
  rather than instead of it.
- ⛔ **This is not an adherence record.** A tick is a note the person made for
  themselves. An unticked activity means nothing was ticked — not that
  anything was missed, skipped or failed. **No streaks, no percentages, no "3
  of 4 done" tiles**, the same mistake CLAUDE.md warns about for the home
  screen's panels. `mobile/__tests__/GoalScreens.test.tsx` asserts the words
  never appear.
- A completion is a **local calendar day** sent by the client, never a UTC
  instant — the same rule as a reminder being a wall-clock "HH:MM".
- Deleting a goal deletes its activities and every tick, in the endpoint as
  well as by foreign key. SQLite does not enforce the cascade, so the test
  asserts against the table.

### A saved goal can be edited (2026-09-16)

`PUT /goals/{goal_id}` and `GoalEditScreen`. Before this the only way to change
a goal was to delete it and write it again, which threw away every tick along
with it — playtesting reported it as the obvious missing thing.

⛔ **Rows are matched by `id`, and that is the whole design.** A
`GoalCompletion` points at an activity id, so replacing the activity rows on
every save — the easy implementation — would silently discard the person's
ticks for every goal they ever edited, including today's. A row that keeps its
id is edited in place and keeps its history; a row with no id is new; a row the
payload leaves out is deleted along with its completions, explicitly, because
SQLite does not enforce the cascade.

⛔ **An id that is not on this goal is a 400, never a new row.** Treating it as
new would let a stale client detach a row from its ticks with nothing appearing
to go wrong. Sending one id twice is refused for the same reason: the loser
would vanish in silence.

⛔ **The editor proposes nothing.** There is no description box and no call to
`draftGoal` — the model is not consulted from that screen at all. Editing is
not an occasion for MedHelp to write more health content, which keeps
origination to the one screen this file describes. A test asserts it, and
another asserts a saved row is never relabelled "Suggested by MedHelp": the
person confirmed every row when they pressed save, so the label would be false.

⛔ **`description` is not editable and must not become so.** It is the text the
person originally wrote and what `structure`'s quoting check ran against — the
record of what was asked for, not a field.

`cadence` and `times_per_week` are derived from `days` server-side, exactly as
`_validate_plan` derives them, so an edit cannot produce "three times a week"
beside four ticked days whatever the client sends.

⛔ **`detail` and `evidence_domain` are assigned on every edit, and every
column on `goal_activities` must be.** Leaving them out was silent data loss
caught while merging: an edit that changed only a time would have stripped the
"how" line and the published citation off *every row of the goal*, with nothing
on screen saying so. Two tests pin it — one that a row sent back unchanged
keeps both, one that a row whose text was rewritten loses both.

The clearing is deliberate and belongs to the client: a citation attributes
published guidance to the sentence MedHelp wrote, so when somebody replaces
that sentence, leaving the publisher's name under it would attribute their
guidance to words the publisher never saw. `GoalPlanEditor.updateText` clears
them, the same line `GoalCreateScreen` uses. That is why the server assigns
rather than merges — a "keep what was there" merge could not express it.

⛔ **`ActivityOut` returns `evidence_domain` beside the resolved `evidence`.**
`evidence` is rebuilt server-side on every read, which is what keeps one copy
of every quotation in this app, and it cannot be turned back into an id. Without
the id no editor could say "this row is unchanged". Only the id travels in
either direction; the publisher, quotation and link stay the server's.

`GoalPlanEditor` is the edit screen's editor. Its rows carry their own `source`
and `suggested` labels rather than parallel arrays indexed by position, which
is what stops a "Suggested by MedHelp" label landing on the wrong line after a
removal — a correctness question, not a cosmetic one.

⛔ **`GoalCreateScreen` does not use it, and the duplication is known.** The two
screens have diverged: the create screen renders a draft's provenance — the
quoted phrase, the "suggested" label, the citation — none of which applies to a
goal the person already saved, and it keeps four lists in step to do it. What is
duplicated is the day chips, the time check and the React Native Web
accessibility workaround. Folding them together is worth doing; it was not worth
doing inside a merge resolution, which is how the duplication arrived.

**Not built, deliberately:** reminders for a goal, and any weekly review.
Neither is hard — a reminder would reuse the local-only `notificationService`
— but both add surface to an instrument no clinician has read.

### Approval, and what it does not cover

The repository owner asked for this feature in conversation on 2026-09-07,
having been shown that the originally proposed design (a model authoring
weekly plans, with a second model checking them for safety) could not be
built here. That is approval to **build it on a branch**.

They asked again on **2026-09-12**, in conversation, for the blocking to be
removed and for the section to produce a plan and a daily schedule for any
health goal typed in. That is the approval this change rests on, and it was
given after being told plainly that removing `_FORBIDDEN` leaves the prompt as
the only guard. Same basis as the other entries this file records: a person
answering in their own words, outside the agent pipeline.

⛔ Neither is clinical sign-off, and the 2026-09-12 one makes that review more
urgent rather than less. `SYSTEM_PROMPT`, `PLAN_SYSTEM_PROMPT` and the cadence
copy in `core/goal_structuring.py` are a software engineer's construction and
belong in the same review as `followup.py` and `dose_schedule.py`. It is
**not** approval to merge to `main` or to deploy — this file fences those
separately and they need their own answer.

The goals screens deliberately do **not** use `DisclaimerBanner`. Which
screens show it is fenced by this file, and adding it to a new screen is a
reviewer's call, not a layout one. They carry a plain statement about the
software instead.

⛔ **The authorship sentence is conditional; the rest of that footnote is
not.** Found 2026-09-14 by exercising the no-model path, which is what every
deployment without a key produces: `draft` returns nothing, the person types
the plan themselves, and the screen then told them their own choices were
"suggestions written by MedHelp". Untrue, on the one thing on that screen
whose job is to say what a person is looking at.

⛔ **A test was pinning it.** That test drafted with *no* suggestions and then
asserted the suggestion wording — green, and enforcing something false. It now
covers each state, and a second test covers the no-model one. Only the
authorship clause differs: "nobody medically qualified has checked" this and
"speak to a healthcare professional" about a condition, a medicine or a big
change to eating or exercise are required in **both** and must not become
conditional.

⛔ **That statement was rewritten on 2026-09-12 and the old one must not come
back.** It used to read "MedHelp tracks what you decide to do, does not decide
what your goals should be" — which stopped being true the moment the app began
proposing plans. `GoalCreateScreen` now says the suggestions were written by
MedHelp rather than by a doctor or nurse, that nobody medically qualified has
checked them, and to speak to a professional before acting on a goal about a
medical condition, a medicine, or a big change to eating or exercise. With the
refusal gone, that footnote is the only thing on the screen telling a person
what they are looking at. A test asserts it.

### Goals may use a different model endpoint from triage

`GOALS_LLM_BASE_URL` / `GOALS_LLM_MODEL` / `GOALS_LLM_API_KEY`, each falling
back to its `LLM_*` counterpart when empty.

**Why this is not gratuitous config.** One set of settings used to serve every
model caller, so pointing them at a hosted provider to get goal suggestions
also started sending *symptom descriptions* there — the most sensitive free
text in the app, belonging to the feature with the standing release blocker.
A data-handling decision must not happen as a side effect of switching on a
different feature.

- **Unset, the overrides change nothing.** A deployment that never sets them
  behaves exactly as it did before the split. Asserted by a test, because that
  property is the whole reason this was safe to add.
- `llm.Endpoint` carries a `label`, so the transmission warning names *which*
  data is leaving — "Health goal descriptions" or "Symptom descriptions".
- The warning fires **once per host**, not once per process. Two endpoints
  mean a warning about one is not a warning about the other.
- ⛔ **`tests/conftest.py` must blank these too.** The autouse `_no_live_model`
  guard exists because the suite once made real calls from a developer's
  `.env`; a second set of settings is a second hole in it, and
  `tests/test_llm_endpoints.py` asserts the guard covers them.

#### A Groq key on its own is enough, wherever it is set

Setting the three `GOALS_LLM_*` variables is the general form — any provider,
stated in full. A Groq key is the one-setting form of the same thing:
`llm.groq_endpoint_or_none()` pairs it with `GROQ_BASE_URL` and
`GROQ_DEFAULT_MODEL`, both constants of that vendor, so goal drafting works
from a pasted key.

This exists because of a reported failure with a silent symptom. The
`GOALS_LLM_*` fallback is all-or-nothing on purpose — see above — so a key set
without a base URL beside it was ignored *entirely*, and goals fell through to
`LLM_*`. Where that names an Ollama that is not running — a dev machine with
nothing started, or a hosted instance where nothing listens on localhost — the
result is an outage, and an outage here is the sentence "MedHelp has no
suggestions right now" with a working key set three inches away.

`llm.groq_key_source()` therefore reads a Groq key from three places, in
order: `GROQ_API_KEY`; `GOALS_LLM_API_KEY` with no `GOALS_LLM_BASE_URL` beside
it; `LLM_API_KEY` with no `LLM_BASE_URL` beside it. The last two are read
**only** when the key carries Groq's own `gsk_` prefix, so the vendor is read
off the key rather than assumed, and an OpenRouter or Google key parked in the
same slot is never posted to Groq. A key that is already beside a base URL is
doing a job and is never reassigned.

- **Precedence: an explicit `GOALS_LLM_BASE_URL` wins, then `GROQ_API_KEY`,
  then `LLM_*`.** Naming a provider in full is the more specific instruction,
  so a leftover key cannot redirect goals away from an endpoint someone chose
  deliberately — including a local one, the only choice that transmits nothing.
- **`GOALS_LLM_MODEL` still names the model** when it is set, so a different
  Groq model is one setting rather than a second code path.
- ⛔ **The key is read in `goals_endpoint()` and nowhere else, and must stay
  that way.** The reason this shortcut is safe is that it cannot move symptom
  descriptions: those go wherever `LLM_*` says, which is nowhere by default.
  A key that switched on both features at once would make the most sensitive
  free text in the app a side effect of switching on goal suggestions, which
  is precisely what the endpoint split exists to prevent. Tested.
- The shortcut is through the configuration, never through the disclosure:
  the endpoint is not local, so the transmission warning names Groq and the
  goal text exactly as any other hosted endpoint does. Also tested.
- ⛔ `tests/conftest.py` blanks this too, for the same reason it blanks the
  others — it is a third way to reach a live endpoint from a developer's
  `.env`.

**A wrong value fails as loudly as a missing one.** Both of these reach the
person as the same sentence — "MedHelp has no suggestions right now" — and used
to reach an operator as an indistinguishable `HTTP 404`:

- `llm.completions_url()` corrects the two base URLs people actually mistype:
  one that already ends in `/chat/completions` (copied from a provider's curl
  example, and otherwise doubled), and `https://api.groq.com` with no path,
  which is the vendor's name for itself rather than its OpenAI-compatible base.
  ⛔ Nothing else is guessed — an unknown host with an unexpected path is sent
  exactly as configured, because rewriting it would hide the real mistake.
- `llm.chat` names the provider's own error **code** when it is one of the
  handful in `_KNOWN_ERROR_CODES`, so a retired model name and a revoked key
  stop looking alike. ⛔ It is an allowlist, not "log whatever we were given":
  the rule that nothing from a response body is read unless it is known to be
  safe still holds, because a provider error message can quote the request —
  which is the person's own health text. A test asserts an unfamiliar body
  contributes nothing but its status code.

**A misconfiguration here is no longer invisible.** `report_goals_endpoint()`
in `app/main.py` logs at boot which model goals resolved to and which setting
the key came from — never the key itself — or says plainly that there is none.
`GET /health` reports `health_goals_model_configured`, a boolean beside
`symptom_intake_configured` and held to the same rule: it says a credential
source exists and never which vendor or which key. Both exist because drafting
answers with an empty editor for a missing key, an unreachable endpoint and a
refusal alike, so "is a model even configured?" could not be answered from a
deployment nobody can attach a debugger to.

### PHI status

`health_goals`, `goal_activities` and `goal_completions` say that a named
person intends to do a named thing and did or did not tick it on a named day.
**Not encrypted at rest** — the same open finding as `medications`,
`intake_assessments` and `appointments.reason_for_visit`.

Goal text is health free text about an identified user, so a non-local
`LLM_BASE_URL` transmits it to a third party this project has no BAA with.
`llm.endpoint_is_local()` makes the distinction visible; it does not make it
safe. With no endpoint configured the feature still works — the person types
their own activities and nothing leaves the machine.



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Health goals (implemented)


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

