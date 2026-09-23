# Check-ins

Added 2026-09-22. `mobile/src/services/checkIns.ts`, the "Check in later"
block on `IntakeResultScreen`, a card on `TodayScreen`, and a prefilled mode of
`SymptomIntakeScreen` (`{ checkIn: true }`).

## What it does

After an URGENT or SELF_CARE estimate, the person can ask MedHelp to check in
a day later. That stores one pending check-in on the device and arms a one-off
notification. When it is due, Today shows it; answering it opens the symptom
form with what they wrote last time already in the box, editable, and the
earlier estimate stated above it. They describe things again and get a fresh
assessment through the normal path.

"Come back if it is not getting better" is ordinary safety-netting. MedHelp
used to end at the answer; this is the smallest thing that closes the loop.

## ⛔ What it is not

- **Not a triage input.** The earlier tier is shown to the person as a fact
  ("Earlier estimate: Urgent — be seen soon") and is never sent to the server
  or used to compute anything. A floor of "the new tier may not be lower than
  the old one" was considered and **not** built: it would be a change to how a
  tier is decided, which is fenced, and it needs its own approval.
- **Not an outcome record.** Nothing compares the two answers, scores
  improvement, or reports on whether anyone got better.
- **Never offered on EMERGENT.** That screen's one job is getting help now,
  and "we'll ask you tomorrow" beside "call 911" would undercut it. The block
  sits below the point where the EMERGENT branch returns, and a test asserts
  it never renders there.
- **Nothing is added to the person's text.** The prefill is their previous
  description and a newline. A "Now:" prefix would be MedHelp's words sent to
  triage and later shown in history as theirs.

## Storage and privacy

- **On the device only.** Native: the keystore via `deviceStorage`, beside the
  emergency card. Browser: `localStorage`, the same stated trade the emergency
  card makes. Nothing about a check-in is sent to the server.
- **One at a time.** A new one replaces the old; "which check-in is this?" is a
  question not worth introducing.
- **A description over 1,500 characters is not kept** (Android keystore values
  top out near 2 KB). The check-in still happens with an empty box, rather than
  prefilling a silently shortened version of someone's words.
- ⛔ **The notification is generic** — "You asked MedHelp to check in. How are
  you feeling now?" — because it shows on a lock screen. Tested.
- ⛔ **Explicit sign-out clears it.** On a shared computer the next person to
  sign in would otherwise find the previous person's symptoms prefilled. A 401
  does *not* clear it: a check-in is due a day later, when the one-hour session
  has long expired, and clearing on 401 would cancel every check-in silently.
- Route params carry a flag, never the text — route state is serialisable and
  dev tooling persists it.

## Arming

⛔ The check-in notification is armed by `reminderArming` in the same
`scheduleAll` call as dose reminders and refill alerts. `cancelAll` cannot tell
notification types apart, so arming it separately would have it cancelled by
the next dose-reminder arm — the exact failure the single-arming-function rule
exists to prevent. Tested.

Like a refill alert it is one-off and never repeated. On the web it fires only
if the tab is still open a day later, and the result screen says so; Today is
the part that is always correct.

## For the reviewer

The "Check in later" block is new content on the intake result screen, which
CLAUDE.md fences for disclaimers and escalation copy. Neither changed. It still
changes what a reader of that screen is offered, so it belongs in the clinical
reviewer's read of it, as the URGENT hand-off does.
