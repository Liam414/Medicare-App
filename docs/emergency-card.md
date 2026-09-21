# Emergency card

Detail behind CLAUDE.md, section "Emergency card".

## Emergency card (implemented)

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
  here.

#### ⛔ The count cap did NOT keep the record inside the keystore (FIXED 2026-09-20)

This bullet used to end *"The cap is also what keeps the record inside
Android's SecureStore size limit (~2048 bytes), above which a write can be lost
silently."* **That was false, and it was false by a factor of seven.**

| 25 medications, fields at | serialises to |
|---|---|
| 300 / 300 — the documented caps | **15,601 bytes** |
| 100 / 40 — long names | 4,101 bytes |
| 40 / 20 — **ordinary** | 2,101 bytes |

At the caps as written, **three** medications fit under 2048 bytes. With
ordinary names, 24 of 25 fit — so an average user was already at the edge.

The consequence was invisible by construction. An oversized write is lost
silently, `mirrorMedications` catches and swallows the failure because it must
never break the medication screen, and the card then renders **no medication
list at all** — on the one screen built to be read when nothing else works, by
somebody with no way to know anything is missing.

`KEYSTORE_VALUE_MAX_BYTES` (1800, with deliberate headroom under the
approximate platform limit) now budgets the write by UTF-8 bytes. Entries are
added while they fit and the rest are dropped, so a long list degrades to a
shorter one rather than to nothing, and order is preserved so what survives is
the top of the person's own list.

⛔ **The old test passed while proving nothing.** "caps the list, because the
record has to fit the platform keystore" used `"Synthetic 0"` / `"1 mg"` —
about 1 kB for the whole list — so it exercised the count cap and never the
byte limit it was named for. It is kept, and a second test now asserts the
actual invariant at the field caps.

#### ⛔ The card itself fits by 102 bytes, and only because it has six fields

Checked while fixing the mirror. All six card fields at `FIELD_MAX_LENGTH`
serialise to **1,946 bytes** against the ~2048 limit. It fits — but a
**seventh** 300-character field takes the record to roughly 2,250, over the
line, where the write is lost silently and the person's *whole card* is gone.

Unlike the mirror, the card cannot drop a field to fit: every one of them is
something a responder may need. So the margin is now asserted by a test
(`the whole card fits the keystore with every field at its cap`) rather than
left to arithmetic nobody redoes.

⛔ **If that test goes red, the answer is a smaller `FIELD_MAX_LENGTH` or a
byte budget like `mirrorMedications` has — never a bigger number in the
assertion.**

**Known limit, not fixed:** truncation is silent. A person with 25 unusually
long medication names sees the first few and no note saying the list was cut.
That is strictly better than the previous behaviour of seeing none, and with
ordinary names it does not trigger — but it sits against this screen's own rule
that a gap is information, and making the card say "showing N of M" needs the
stored record to carry the original count.
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



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Emergency card (implemented)


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

