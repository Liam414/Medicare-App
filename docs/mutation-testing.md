# Mutation testing: is the suite evidence about the code?

Detail behind CLAUDE.md, section "The suite is checked against itself".

#### ⛔ A passing suite is evidence about the tests, not about the code

`backend/scripts/mutation_check.py` breaks each rule these features claim to
enforce and checks the suite notices. A mutation that **survives** is a rule
nothing is actually testing.

    python backend/scripts/mutation_check.py            # everything
    python backend/scripts/mutation_check.py goals
    python backend/scripts/mutation_check.py triage

⛔ **It never touches the working tree.** Every mutation is applied to a
throwaway **copy** of `backend/`, and the suite runs there. The first version
edited files in place and restored them in a `finally`, which leaves a window
where an interrupted run strands a mutated source file — observed once, on a
real run. Untidy for `goal_structuring.py`; unacceptable for `triage.py`, so
the design changed rather than the reassurance.

⛔ **The triage group reads fenced modules and changes none of them.** This
file forbids modifying `triage.py`, `rules_triage.py` and `emergency.py`, and
permits adding tests for them. This adds no test to them and modifies nothing:
it copies, breaks the copy, and deletes it. `git status` after a run confirms
it.

⛔ **All five of the properties listed under "How the safety architecture
works" are probed, and all five are genuinely caught.** That section says they
are "each asserted by tests"; this is the first time that claim has been
checked rather than trusted, and it holds:

| | mutation | |
|---|---|---|
| 1 | the rules default to SELF_CARE instead of URGENT | caught |
| 2 | a red-flag match returns URGENT instead of EMERGENT | caught |
| 3 | `max()` becomes `min()` in `_reconcile` | caught |
| 3b | the model tier simply replaces the rule tier | caught |
| 4 | the model supplies the reasoning even when its tier lost | caught |
| 5 | a model outage produces SELF_CARE instead of the rule tier | caught |

Property 1 is the one this file calls "the single most important rule here",
and property 5 is the one that guarantees a broken model never reassures
anybody. Both are load-bearing.

⛔ **This is not clinical validation and does not touch the release blocker.**
It says the tests fail when the code stops doing what this file says it does.
Whether what this file says is clinically right is the question a clinician has
to answer, and nothing here goes near it.

#### Three "closed" findings are now verified as actually closed

The `privacy` group probes the data-handling rules this file states and
attaches "a test asserts it" to. Five, all caught — and three of them are
items listed above under **Closed (fixed, with tests)**, which until now had
only ever been *recorded* as closed:

| rule | |
|---|---|
| a rejected value is not echoed back in a 422 (closed finding 1) | caught |
| SQLAlchemy does not put bound values into its exception text (closed finding 5) | caught |
| `BookingIdentity.__repr__` is redacted | caught |
| `appointments` gains no column that could hold an identity | caught |
| `provider_locations` gains no column saying who looked | caught |

The last two are the structural ones: the test checks the mapped table, so a
column added by any route is caught — including the near-misses this file
names, `patient_name` and a `user_id`. Adding either one now fails, which is
what those tests promised.

#### Data that must not outlive what it described

The `integrity` group, four rules, all caught: deleting a medication takes its
reminders, deleting a goal takes its ticks, `forecast()` never gains a
`frequency` argument, and a **fourth** concept combination fails
`test_the_set_of_combinations_is_fenced`. The first is the one this file calls
"not untidy data, it is an alarm telling someone to take a medication they
have stopped", and SQLite does not enforce the cascade — so that test is
load-bearing in the literal sense.

⛔ **A mutation that changes nothing reports SURVIVED, and looks exactly like
a missing test.** That happened here: `db.query(...).delete()` was rewritten
to `_unused = db.query(...)`, which still calls `.delete()` on the same chain.
It read as a cascade nobody tested; the cascade was fine and the mutation was
worthless. The anchor count catches a mutation that could not be applied;
nothing can catch one that applied and meant nothing. **Read the diff a
survivor implies before believing it** — the script's own docstring says so
where someone will be looking.

#### The client has one too

`mobile/scripts/mutation_check.mjs`, same idea on the other side of the wire,
and for the same reason: two of the four "green for the wrong reason" tests
were here. Six rules, all caught:

| rule, in this file's own words | |
|---|---|
| an empty emergency-card field renders "Not provided", never a missing row | caught |
| the session token stays in `sessionStorage`, never `localStorage` | caught |
| the goals screen is not an adherence record — no "3 of 4 done" | caught |
| the tick says in its label whether it is ticked | caught |
| the source disclosure says in its label whether it is open | caught |
| a closed disclosure renders no citation at all | caught |
| the emergency card is never posted to a server | caught |
| a fired reminder never phones home with the medication name | caught |

The second is worth singling out. This file claims both halves of the
storage split are "asserted by tests so that 'fixing the inconsistency' in
either direction fails the suite" — moving the token to `localStorage` does
fail, so that claim holds.

⛔ **The scratch copy lives under `mobile/` rather than the system temp
directory**, because jest resolves `node_modules` by walking up from
`rootDir`. It is removed in a `finally` and `.gitignore`d for the run that is
interrupted anyway.

It exists because that failure happened **four times in one sitting**, on this
feature, under a green suite:

- the goals screen's ticks asserted `accessibilityState`, which passes in jsdom
  whether or not anything reaches the DOM;
- the shape bands' attribution rule explained every rejection once the floor
  was set to something unsatisfiable;
- the prompt-ordering test matched a cross-reference instead of a heading, and
  would have passed whatever the ordering was;
- and **the two `complexity` tests, found by this script**. Both used a
  one-row plan, so replacing the discard with `complexity = "moderate"` still
  failed the moderate *row count*. They demonstrated "one row is not three
  rows" while claiming to demonstrate "a missing reading is refused". They now
  use a plan that moderate would accept, and
  `test_the_fixture_those_two_rely_on_really_would_be_accepted` fails if that
  stops being true.

All eighteen mutations are caught as of 2026-09-14, including the caveat, the
evidence register refusing a nearest match, emergency screening running first,
and a suggested row staying labelled `generated`.

⛔ **An anchor that does not apply is reported, never counted as caught.** Two
were wrong on their first run and the guard said so instead of printing a
pass: a multi-line anchor written with bare line feeds matched nothing against
CRLF files, and `screen_for_emergency` matched three places (the docstring,
the import, the call). The in-place version had silently replaced all three.

- ⛔ **A survivor is not fixed by deleting the mutation.** Fix the test.
- Not part of `pytest` — it runs the suite once per mutation.

⛔ **Suggestions are not clinically reviewed, and they are what everyone
sees.** They are written by a software engineer; no clinician has read
`PLAN_SYSTEM_PROMPT`, and since 2026-09-12 it is the whole of the guard rather
than one layer of two. It belongs in the same review as `followup.py` and
`dose_schedule.py` and is now clearly the most urgent of the three.

⛔ **The safety checks are asymmetric, and origination is on the weaker side.**
The quoting and digit checks below cannot apply to a plan nobody wrote, so an
originated row is now guarded by the prompt alone, where a structured row is
guarded by the prompt *and* the requirement that it quote the person. Almost
every row a person sees is an originated one. **Reinstating a narrow, reviewed
veto list is the cheapest safety work available in this feature** — it is
deliberately not guessed at here, and it is the first thing to ask the
clinical reviewer about.

