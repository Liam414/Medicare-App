# Medication reminders and refill alerts

Detail behind CLAUDE.md, section "Medication reminders".

## Medication reminders (implemented)

A user can set daily times for a medication and be notified at each one. The
times come from a suggestion the user confirms; nothing schedules itself.

### ⛔ MedHelp proposes times. It never sets them.

`frequency` is the sig line, carried **verbatim** from the label. Turning
"TAKE 1 TABLET BY MOUTH TWICE DAILY" or "BID" into two alarms is a decode of
dosing instructions — the exact thing the verbatim rule under "Medication
label scanning" forbids, because a wrong expansion changes when someone takes
a medicine.

So the feature is built as read-then-confirm, the same shape as the scanner:

- `backend/app/services/dose_schedule.py` proposes times. It is an explicit,
  readable phrase list a clinician can check line by line — not a model, not a
  general parser.
- `GET /reminders/medications/{id}/suggestion` returns that proposal and
  **writes nothing**. A test asserts a suggestion leaves the user with no
  reminders.
- `ReminderEditScreen` shows the proposal as an editable draft with the
  printed directions **unedited beside it**, so the user compares the times
  against the label rather than trusting the app. Reminders exist only after
  they press save.
- The default clock times (08:00/20:00 and so on) are **neutral waking-hours
  conveniences, not clinical choices**. Which hours suit depends on the
  person, the drug, and instructions this app never sees. The UI says so.

**It declines far more readily than it guesses.** Anything not on the lists
returns no suggestion and a reason the user is shown, and they set their own
times. Deliberately refused:

- **"As needed" / PRN.** Recognised only in order to refuse it. An as-needed
  label often carries an interval ("every 6 hours as needed"), but that is a
  *maximum*, not a schedule — an alarm built from it would tell someone to
  take a medicine they may not need. This is the most important refusal here.
- **Anything not a daily rhythm** — weekly, every other day, cycled courses.
- **Food and route qualifiers** ("with food") are left in the verbatim text,
  never turned into mealtimes. MedHelp does not know when anyone eats.

#### ⛔ "WHEN REQUIRED" IS PRN TOO, AND IT USED TO BE MISSED (FIXED 2026-09-20)

`AS_NEEDED` carried "as required", "when needed" and "if needed" — three of the
four combinations of {as, when} × {needed, required} — and missed **"when
required"**, which is exactly how a British label prints PRN.

So `TAKE 1 TABLET EVERY 4 HOURS WHEN REQUIRED` was read as a plain four-hourly
interval and proposed **six alarms a day, including 00:00 and 04:00**: the app
waking somebody at four in the morning to take an as-needed painkiller. That is
the failure the bullet above calls the most important refusal here, and it was
live. `every 6 hours if required` and `every 8 hours when necessary` did the
same thing.

Found by running real-world sig lines through `suggest_times` rather than by
reading it. `test_british_phrasings_of_as_needed_are_never_scheduled` holds it.

⛔ **Extending `AS_NEEDED` is one-directional and therefore safe** — every
addition can only make the function refuse *more*, never schedule more. A wrong
refusal costs somebody the minute it takes to type their own times; a wrong
schedule is an alarm telling them to take a medicine they may not need. Add
freely. Never remove without the clinical review these phrase lists are still
waiting for.

#### REPORTED, NOT FIXED: a finite course becomes a permanent alarm

`TAKE 1 TABLET DAILY FOR 7 DAYS THEN STOP` is suggested 09:00 **daily, with no
end**. The daily part is right — it is a once-daily medicine — so refusing it
outright would lose a genuinely useful suggestion for exactly the case
reminders help most with, a short antibiotic course.

What is missing is an end date, and `medication_reminders` has no column for
one. That is a feature and a migration, not a phrase-list fix, so it is
reported rather than built.

Two things bound it today: `ReminderEditScreen` shows the printed directions
**unedited beside the proposed times**, so the person reads "FOR 7 DAYS THEN
STOP" while confirming, and deleting the medication deletes its reminders. It
is still the same family as the leftover-reminder rule elsewhere in this file —
*an alarm telling someone to take a medication they have stopped* — and an end
date is the honest fix.

Times are rejected, never reinterpreted: `8am`, `0800` and `8:00` are refused
rather than guessed, because "8" could be either end of the day.

### Delivery differs by platform, and the difference is stated to the user

| | Engine | Fires with the app closed |
|---|---|---|
| `notificationService.ts` (iOS/Android) | `expo-notifications`, daily local trigger | **yes** — the OS holds it |
| `notificationService.web.ts` (browser) | `setTimeout` + the Notification API | **no** — only while the tab is open |

Metro picks the variant; both export the same functions, so the screens are
platform-agnostic. The reminders screen renders the web limitation as a
standing notice rather than letting someone assume an alarm clock.

- ⛔ **These are local notifications only.** No push token is requested and
  nothing is registered with Expo's push service, FCM or APNs. **Do not add
  `getExpoPushTokenAsync` or Web Push without a BAA decision** — a payload
  naming a person's medication makes those services processors of PHI. Web
  Push was considered for background delivery on the web and rejected on
  exactly that ground; it would also need HTTPS, so it cannot work on the LAN
  address the app is served from today.
- Nothing about a reminder leaves the device. Both services make no network
  call; a test asserts `fetch` is never called when one fires.
- ⛔ **Never ask for notification permission without a user gesture.** Same
  rule, and same reason, as location: an unprompted request is suppressed by
  browsers and a blocked site never prompts again. `getPermission()` only
  reads what is already granted; a button is the only thing that asks.
- The **on-screen list is the part that is always correct**, and the
  notification is the bonus on top. That is why the screen shows today's times
  and their state on open.

### Rules for anyone extending this

- **A reminder time is a local wall-clock "HH:MM", never a UTC instant.**
  Eight in the morning means eight in the morning wherever the person is;
  converting through a timezone would move a medication time when they travel.
- **This is not an adherence record.** A time that has gone by shows as
  "earlier today", never "missed" — MedHelp has no idea whether the dose was
  taken, and implying otherwise invents a clinical fact about the user.
  Nothing here tracks, scores, or reports adherence.
- **Deleting a medication deletes its reminders**, in the endpoint as well as
  by foreign key. A leftover row is not untidy data, it is an alarm telling
  someone to take a medication they have stopped. SQLite does not enforce the
  cascade, so the test asserts against the table, not the listing.
- `medication_reminders` stores no medication name — it joins for that. A
  second copy would be a second place health data leaks from.
- The notification body names the medication, because one that will not say
  what to take is no use. **That makes it visible on a lock screen** to anyone
  nearby. Accepted for now; if that becomes unacceptable the body can be made
  generic, which is a copy change in one place per platform.

### Refill alerts: when a supply is estimated to run out

Built on the existing `medications` record rather than beside it. Three
nullable columns were added — `quantity_remaining`, `quantity_counted_on`,
`doses_per_day` — and the estimate is derived server-side in
`backend/app/services/refill_forecast.py`.

**`refill_date` and `refill_estimate` are two different claims and must stay
apart.** `refill_date` is a date the user wrote down; the estimate is
arithmetic MedHelp did. They have separate fields, separate badges, separate
wording, and separate lead times. ⛔ Do not collapse them — a guess that
inherits a record's authority is exactly the failure this app is built to
avoid elsewhere.

#### ⛔ The directions line is never read

`forecast()` **does not take a `frequency` argument at all**, and
`refill_forecast.py` does not import `dose_schedule`. Both are asserted by
tests, against the function signature and the module's import statements,
so adding one is a failing suite rather than a quiet change of policy.

Reading a dose count out of "TAKE 1 TABLET BY MOUTH TWICE DAILY" is the decode
the verbatim rule forbids, for the same reason it forbids expanding BID into
two alarms: a wrong expansion changes when someone takes a medicine.

So `doses_per_day` comes from one of two places, in this order:

1. **A number the user typed** on the medication form (`"entered"`).
2. **The count of their enabled reminder times** (`"reminders"`). Those rows
   exist only because someone reviewed a draft and pressed save, so counting
   them adds no guess of MedHelp's own.

With neither, there is no estimate and the user is told which half is missing.
`doses_per_day_source` is returned so the screen can show what the estimate
rests on rather than handing over a date with no provenance.

#### ⛔ It is an estimate, and every surface says so

`is_estimate` is a property that cannot be constructed false, and it is true
whenever there is a date at all. The projection assumes **every dose is taken
exactly on schedule**, which MedHelp has no way to check — CLAUDE.md is
explicit that this is not an adherence record, and `reminderTiming.dueState`
already says "earlier today" rather than "missed" for the same reason.

Tests assert the wording on the card badge and in the notification body, and
assert that neither says "missed", "skipped" or "forgot".

#### Declining is a normal outcome

No quantity, no confirmed doses-per-day, a count dated in the future, or more
than a year's supply: each returns no date and a reason meant for the user.
A confident wrong run-out date is worse than none for someone deciding whether
to chase a prescription.

`quantity_counted_on` is what stops a count going stale silently — "30 left"
means nothing without the day it was true, and a projection with no origin
would report the same answer forever. The API fills it with today when a
quantity arrives without one.

Nothing rounds up: seven tablets at two a day is three whole days, not four.

#### The lead time is a device setting, not an account one

Default 3 days, choosable from the reminders screen (1/3/5/7/14).
`appSettings.ts` keeps it in `deviceStorage`, and it travels to the API as
`GET /medications?refill_lead_days=N`.

There is no user-settings table, and adding one for this would put a row about
a named person's medication habits into a database with no encryption at rest
— for a number that only ever changes when a notification fires on that
device. The consequence is that each device keeps its own.

The **arithmetic still happens server-side**, which is what keeps the
medication list and the reminders screen flagging the same medications.

#### Both kinds of notification are armed in one call

`scheduleAll(reminders, { refillAlerts })`, from
`mobile/src/services/reminderArming.ts` and nowhere else.

⛔ They cannot be armed separately. `cancelAll()` clears everything — on native
it calls `cancelAllScheduledNotificationsAsync`, which does not distinguish
between them — so two arming functions would take turns cancelling each
other's work. The symptom would be a notification type that silently stopped
firing depending on which screen was opened last. A test asserts both survive
one call.

#### ⛔ One arming *function*, not one caller (fixed 2026-09-16)

This used to say `MedicationRemindersScreen` **and nowhere else**, and that
was the wrong half of the rule to enforce. Arming happened in that screen's
focus effect, so notifications existed only if you visited it: a person who set
their times and then opened the app on any other tab had nothing armed at all.

Invisible on iOS and Android, where the OS keeps yesterday's daily triggers —
and **total on the web**, where the timers are `setTimeout` handles in a module
array that every reload throws away. Playtesting found it as reminders that
were saved, listed correctly on screen, and never delivered.

`rearm()` now runs at app start too, from `RootNavigator` as soon as there is a
session. What the rule actually protects is that **every arm sends the complete
set** — the danger is two functions each arming a subset. More callers are fine;
a partial arm is not. Two properties hold, both tested in
`__tests__/reminderArming.test.ts`:

- **`reminderArming` is the only module that calls `scheduleAll`.** ⛔ Do not
  import it anywhere else, and do not add a second arming function.
- **Runs are serialised.** App start and a focus effect really do overlap when
  the app opens on Medications, and two overlapping runs would interleave one's
  `cancelAll` with the other's scheduling — exactly the silent-stop this rule
  exists to prevent.

`rearmFrom(state)` arms from a set the caller already loaded, so the reminders
screen does not fetch everything twice on every visit. Same queue, same
whole-set rule.

Arming is best-effort and never surfaces an error: an app start with no network
returns `null` having cancelled nothing, so whatever the OS already holds
survives.

| | Trigger | Repeats |
|---|---|---|
| Dose reminder | daily, at a wall-clock time | yes, every day |
| Refill alert | a one-off calendar date at 09:00 local | **no** |

A refill alert is about one estimated date; repeating it would nag about a
supply the user may already have replaced.

The run-out date is parsed as **local midnight, not UTC**.
`new Date("2026-09-18")` is UTC by specification, which is the previous
evening anywhere west of Greenwich and would move the alert a day for most of
the Americas. Tested.

An alert whose moment has passed is not scheduled at all — a notification
cannot fire into the past, and re-firing one on every screen load would be
worse than not firing it. The **badge on the medication list is the part that
is always correct**, the same division of labour the reminders screen already
relies on. On the web the setTimeout ceiling (~24 days) also applies, and a
refill alert is days out, so it misses far more often than a dose reminder
does.

#### ⛔ Deploying this needs a hand-run script

The three columns went onto a table that already exists, and the start command
runs `create_missing_tables.py`, which creates missing tables and never alters
existing ones. Run `scripts/add_medication_supply_columns.py` once against any
database created before this change, or `/medications` returns 500s. It is
idempotent. This is the "a column added to an existing model still needs a
hand-written script" case the deployment section already warns about.

#### Not reviewed, and PHI status

- **Not reviewed by a clinician.** Whether a three-day default is the right
  lead time, and whether a supply projection should be shown at all, belong in
  the same review as the `dose_schedule.py` phrase lists.
- `quantity_remaining` and `doses_per_day` say how much of a named medicine a
  named person has and how often they take it. **Not encrypted at rest** — the
  same open finding as the rest of `medications`.

### Not reviewed, and PHI status

- **Not reviewed by a clinician.** The phrase lists in `dose_schedule.py` and
  the default hours are a software engineer's construction and belong in the
  same review as the intake instrument.
- `medication_reminders` rows say that a named person takes a named medicine
  at a named hour. **Not encrypted at rest** — the same open finding as
  `medications`, `intake_assessments` and `appointments.reason_for_visit`.
- The native path is **untested on a device**: there is no development build
  or hardware here, so it is written against the documented API and unit
  tested against a mock, never observed firing. The web path has been checked
  end to end, including a notification firing at the armed minute.



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Medication reminders (implemented)


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

