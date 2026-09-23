# Care profiles

Added 2026-09-22. Keeping medications, symptom descriptions, visits and an
emergency card for somebody else — a parent, a child, a partner — separately
from your own.

Backend: `app/models/care_profile.py`, `app/api/profiles.py`, a nullable
`profile_id` on `medications`, `intake_assessments` and `appointments`, and
`scripts/add_care_profile_columns.py`. Mobile: `profileService.ts`,
`useActiveProfile`, `ProfileBanner`, `CareProfilesScreen`.

## ⛔ A display name and nothing else

`care_profiles` holds an id, the owner, a name of up to 40 characters, and a
timestamp. A test asserts the column set. No date of birth, age, sex or
relationship:

- each is more data about a person who never signed up to MedHelp;
- an age in particular would be the obvious thing to feed to triage ("my
  6-week-old has a fever"), and changing what triage reads is fenced. The
  description still carries whatever the caregiver writes, exactly as before.

The screen says what is stored and that records kept for someone else are
health information about them, to be kept with their agreement or as their
parent or carer.

## NULL means the account holder

Every `profile_id` is nullable and NULL means "me". Nothing written before
profiles existed changes owner, no backfill is needed, and a client that never
sends a profile behaves exactly as it did.

## One ownership check, used everywhere

`owned_profile_id` in `app/api/profiles.py` is the only place a `profile_id`
from a request is checked. An id the caller does not own is a 404, never a
403. Every list and create endpoint that accepts one calls it.

⛔ **Except that intake never refuses.** `POST /intake/assess` checks the
profile only at the storage step. A stale or foreign id means the row is not
stored; the assessment, including any emergency guidance, is still returned.
Refusing a screening over bookkeeping is the one thing that endpoint must never
do. Tested.

`profile_id` is a query parameter on the list endpoints. It is a server-minted
UUID and can never hold anything a person wrote, which is why it was added to
the query-string allowlist in `tests/test_security_hardening.py` — the
decision that test exists to force.

## Deletion takes everything, explicitly

`DELETE /profiles/{id}` deletes that person's reminders, medications, stored
assessments and appointments, then the profile — in that order, by explicit
query, because SQLite does not enforce the cascade. A leftover reminder is an
alarm to give someone a medicine they may have stopped. The client also clears
that person's emergency card from the device. The screen asks first, inline,
and names what will go.

## Whose records are on screen

- ⛔ **`ProfileBanner` is on every screen that reads or writes someone's
  records** — Today, medications, the medication form, symptom intake,
  history, the visit summary, visits and the visit form. Recording Dad's new
  tablet under your own name is the failure it exists to prevent. It renders
  nothing for someone who manages only themselves.
- ⛔ **Screens wait for the active profile before loading** (`ready`), so one
  person's list is never shown, even briefly, under another person's name.
  Save buttons on create forms are disabled until then.
- ⛔ **Intake does not wait.** If the profile has not loaded, a saved row may be
  filed under "Me", which is recoverable; delaying emergency screening is not.
- The active profile is a device setting (id and name), like the refill lead
  time. A stored id not in this account's list resolves to "Me" rather than
  being trusted — a deleted profile, or another account on a shared device.
  Explicit sign-out resets it.
- Services take `profileId` explicitly and never read the active profile
  themselves. Arming has to reach everyone at once.

## Reminders and refill alerts cover everyone

`GET /reminders` stays unscoped and returns `profile_name` per medication.
Arming schedules everyone's doses and fetches every profile's medications for
refill alerts. Notification text says whose medicine it is ("For Grandad:
Synthetimol — 10 mg"), because a caregiver woken at 8am needs to know which
person the alarm is for. That name then shows on a lock screen, the same
accepted exposure as the medication name itself.

Today lists everyone's medication times, each naming its owner; refill badges
and visits follow the active person.

## The emergency card

One card per person on the device, keyed by profile id; the owner's card
keeps its original key. ⛔ The card screen still makes no network request: it
reads the active profile's id and name from the device, and says "FOR
GRANDAD" under the header, because a responder must not read Dad's allergies
as the phone owner's.

## Check-ins and visit summaries

A check-in remembers whose it is and files its answer there. A visit summary
is one person's: their descriptions and their medications, never a mixture.
For someone else it says it was written by the person who looks after them.

## Deploying

`scripts/add_care_profile_columns.py` must run after `create_missing_tables.py`
on any existing database, or the three list endpoints return 500s. The Render
start command runs both.

## PHI status

A display name is not much, but the rows under it are health information about
a named third party who did not sign up. Not encrypted at rest — the same open
finding as every other health table.
