# Emergency card (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


A screen the user fills in once — allergies, known conditions, blood type, and
who to call — that is readable in one tap from the home screen and works with
no connection. `mobile/src/screens/emergency/`, backed by
`mobile/src/services/emergencyCard.ts`.

**This is not the emergency routing feature.** `app/core/emergency.py` screens
symptom text for red flags and is fenced; nothing here touches it, reads it,
or feeds it. The card is a place to write something down.

### ⛔ It is stored on the device and nowhere else

There is no endpoint, no table, and no `fetch` on this path — a test asserts
it. Two separate reasons, and both have to hold:

- **It has to work when nothing else does.** It is read by someone holding an
  unlocked phone in an emergency, who may have no signal and a backend that is
  down. Anything that needed a request would fail at the only moment it
  mattered.
- **The backend has no encryption at rest** (open finding 2). Allergies and
  conditions are among the most sensitive things this app could hold, so the
  safest place for new health data is a store the server never sees.

The cost is stated on the editor rather than hidden: the card does not follow
the user to another phone or browser, and there is no backup of it.

| | Store | Survives a reload | Survives the app or tab closing |
|---|---|---|---|
| `emergencyCardStorage.ts` (iOS/Android) | Keychain / Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | yes | yes |
| `emergencyCardStorage.web.ts` (browser) | `localStorage` | yes | **yes** |

⛔ **`localStorage` here is deliberate, and is not the rule `tokenStorage.web.ts`
sets.** That file forbids moving the *session token* to `localStorage`, and
that stands. The trade runs the other way for the card: a token is a bearer
credential whose right lifetime is the shortest one that survives a refresh,
while a card that vanishes when the tab closes is a card that is not there
when it is needed, and it grants nobody access to anything. Both halves are
asserted by tests so that "fixing the inconsistency" in either direction
fails the suite.

The exposure that buys is real and is written on the editor screen: **on a
shared or borrowed computer the card stays behind after sign-out**, and no
sign-out removes it. "Erase this card" is offered for exactly that.

### ⛔ Nothing on the card is authored, checked or interpreted by MedHelp

Every field is free text, stored verbatim and rendered verbatim. There is no
picker of conditions, no list of common allergies, and no validation of a
blood type — offering a menu of conditions would make MedHelp the author of a
clinical vocabulary, and checking a blood group would imply a verification
that has not happened.

Nothing reads the card either. It is not an input to triage, to the emergency
screening, or to anything else.

The header is loud enough to carry an authority the content has not earned, so
the screen disowns it in as many words: "MedHelp did not check them and cannot
confirm they are current."

### ⛔ An empty field renders as "Not provided", never as a missing row

The single most important rule on the screen. A card with no allergies row
reads as *no allergies* to whoever is holding the phone; the gap is
information and has to be visible. Asserted by a test.

### The medication list is mirrored to the device, and that is a second copy

Medications are what a responder would most want from this app and are already
collected — but behind an authenticated call, which is the one thing the card
cannot depend on. So `MedicationListScreen` writes an offline copy whenever it
loads, and the card reads that.

- **Name and dosage only**, of at most 25 medications, each field capped at 300
  characters. Not the prescribing doctor, not the notes, not the refill dates:
  none of that helps a responder, and every field left out cannot leak from
  here. The cap is also what keeps the record inside Android's SecureStore
  size limit (~2048 bytes), above which a write can be lost silently.
- It is a **real widening of where health data rests**, stated on the card and
  in the editor. `clearCard()` removes it along with everything else — a clear
  that left a medication list behind would not be a clear.
- The card says it may be out of date rather than presenting it as live.

### Why the palette breaks the house style

The rest of MedHelp is deliberately calm and this screen deliberately is not:
it is found under stress, possibly by someone who has never used the app, so
it is built to be identifiable at a glance. The header ground is
`colors.emergencyText` — an existing reviewed value from the emergency family,
used as a fill, which gives white text 10.8:1 where the lighter border colour
would give 5.3:1. **No token value was changed**, which is what the theme note
asks of anyone touching the safety-meaning families.

`EmergencyCardLink` (the home-screen entry) and `EmergencyCallBar` are
different components on purpose. The link opens a screen; the bar routes to
emergency services. Merging them would blur the one instruction that has to be
unambiguous.

### A lock-screen widget was considered and not built

Asked for as a "flag whether that's feasible, don't force it". It is not, here:

- iOS needs a **WidgetKit app extension in Swift**, an Expo config plugin, and
  a development build — and for distribution an Apple Developer account. This
  project deliberately went the other way (see the browser scanner: "so an
  iPhone needs no $99 account"), and there is no device or dev build in this
  environment to test one on.
- Android needs an App Widget or Quick Settings tile, likewise native and
  likewise a dev build.
- **Both platforms already ship a better version of this.** iOS Medical ID
  (Health app) is reachable from the lock screen's emergency dialler, and
  Android has Emergency information under Settings. A responder is trained to
  look there, not in a third-party app. Duplicating that badly is worse than
  not duplicating it.

If a widget is ever wanted, it should be scoped as native work alongside the
development build `expo-mlkit-ocr` already requires — not bolted on.

### Not reviewed, and PHI status

- **Not reviewed by a clinician.** Nothing here is clinical content, but which
  fields an emergency card should carry is a question a reviewer should answer.
- The card is health data about an identifiable person at rest on a device. On
  native it is in the platform keystore; **in a browser it is unencrypted
  `localStorage`**. That is a new instance of open finding 2 rather than an
  exception to it.

