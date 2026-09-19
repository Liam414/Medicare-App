# Appointments and provider search

Detail behind CLAUDE.md, section "Appointments and provider search". The option analysis for real booking is in appointment-booking.md.

## Appointments and provider search (implemented)

A user can search a real provider directory, open a provider, and record an
appointment. The record lands in the appointment list, which is the same
feature the URGENT tier of symptom intake now routes into.

**MedHelp does not book appointments, and must not say it does.**

Research and the full option analysis: `docs/appointment-booking.md`. The short
version: every API that can actually place a booking (Zocdoc, Epic-hosted
scheduling, athenahealth) needs a signed partnership, provider-side opt-in and
a BAA. This project has none of the three. So the transmission step is absent
and labelled absent, rather than mocked.

- **The directory is real.** NPPES, published by CMS
  (`app/services/provider_directory.py`). Free, no key. It is authoritative for
  who providers are and where they practise.
- **Availability is not shown, because no source for it exists.** NPPES
  publishes none. `Provider` has no slot field, the API response has no slot
  field, and tests assert both. A "next available" time in this app would be
  invented, and someone would turn up for an appointment that does not exist.
- **Creating an appointment contacts nobody.** It writes a row. The provider
  has never heard of it. Three screens say so, and
  `app/services/request_delivery.py` raises rather than quietly succeeding.
- **`provider_notified` is the single source of truth** for whether anyone was
  contacted, and is never inferred from `status` — a user can mark a row
  SCHEDULED because they rang the clinic themselves.

Rules for anyone extending this:

- **Do not add a slot picker, a "Book now" button, or a time, until a real
  scheduling integration exists behind it.** The UI reads
  `online_booking_available` from the API; drive any new affordance off that
  flag rather than off an assumption in a component.
- **Hospitals are searchable, because a hospital is a setting.** NPPES
  enumerates them under `General Acute Care Hospital`. The list previously held
  only physician specialties, so "find me a hospital" was simply not possible —
  "Emergency medicine" is the doctor, not the building. NPPES also enumerates
  *individuals* under that taxonomy, so a result can be a clinician who
  practises at a hospital rather than the hospital itself; that is the source's
  own classification and is left alone, because relabelling or filtering it
  would assert something about a provider the directory does not say.
- **The provider search must never carry health information.** It sends a
  5-digit ZIP and a care *setting* from the fixed `CARE_SETTINGS` list. A
  free-text specialty is rejected on purpose: "Urgent Care" in a CMS query log
  says nothing about the person searching, "Oncology" would. A test asserts the
  outbound parameter set. This is why NLM's BAA question does not arise for
  this vendor.
- **MedHelp does not rank or recommend providers.** Results are sorted by
  distance only, and the screen says the app cannot tell you who is accepting
  patients, open now, or in network. Ordering providers on clinical grounds
  would be a judgement this app may not make — the same rule as the
  MedlinePlus topic filter.
- Distance is a **straight line from the centre of the searched ZIP to the
  provider's street address**, computed by the backend, and is always rendered
  with a "~". It is not a driving distance. See "How a distance is worked out"
  below. The user's own coordinates never leave the phone on iOS/Android and
  reach only MedHelp's backend on web; only the 5-digit ZIP is passed to the
  search.
- Location is **optional everywhere**. `expo-location` needs a development
  build, permission can be refused, and both degrade to the user typing a ZIP.
- **Location works on both platforms, by different routes.** One function
  differs; everything above it is shared.

  | | Position from | ZIP from | Coordinates go |
  |---|---|---|---|
  | `locationService.ts` (iOS/Android) | `expo-location` | the OS geocoder | nowhere |
  | `locationService.web.ts` (browser) | `navigator.geolocation` | `POST /providers/resolve-location` | MedHelp's backend only |

  Metro picks the variant. Both export the same `getPostalCode()` returning the
  same `LocationLookup`, so `ProviderSearchScreen`, `providerService`,
  `apiClient` and every screen are shared and platform-agnostic.

  The split exists because **a browser has no geocoder** — `expo-location`
  throws `E_NO_GEOCODER` from `geocodeAsync`/`reverseGeocodeAsync` on web, and
  there is no browser equivalent. Since the directory is searched by ZIP, a
  coordinate alone is useless, which is why the web build once could not use
  location at all.

  **State the privacy property precisely, because it differs.** On iOS and
  Android the coordinates never leave the phone. On web they reach MedHelp's
  own backend — as a POST body, so they stay out of URLs and access logs — and
  are resolved and discarded, never stored, never forwarded. **No third-party
  geocoder is used on either platform**, and a test asserts no request goes to
  one. Do not copy "coordinates never leave the phone" onto the web file.

  Resolution uses a committed extract of the US Census ZCTA Gazetteer (public
  domain) — `app/services/zip_geography.py`, rebuilt by
  `scripts/build_zip_centroids.py`. This is the "license a redistributable
  dataset and serve it locally" option named above, chosen over a geocoding API
  precisely so no vendor becomes a processor of a health app's location data.

- ⛔ **Never ask for location without a user gesture.** `getPostalCode()` only
  uses a permission that has *already* been granted; it reports `"prompt"`
  otherwise, and the screen turns that into a "Use my location" button.
  `getPostalCode({ prompt: true })` is the only thing that asks, and only a
  button press calls it.
  - This was a real bug, reported as "I never get prompted". Requesting on
    mount is suppressed by browsers that require a gesture, and once a site is
    blocked it never prompts again — so nothing appeared, with no way to retry
    from inside the app. A button guarantees the gesture and gives a second
    chance after unblocking, without a reload.
  - `"prompt"` gets **no** notice. It is not a failure; the button is the
    thing to press. Only real outcomes (`denied`, `timeout`, `unavailable`,
    `insecure`) get a message.
  - Both platforms check first without asking — `navigator.permissions.query`
    on web, `getForegroundPermissionsAsync` on native. An already-granted
    permission still fills the ZIP in silently on arrival, so the common case
    costs no extra tap.

- ⛔ **Geolocation needs a secure context, and a LAN address is not one.**
  Browsers expose the Geolocation API only over https or on `localhost`. Served
  to a phone at `http://192.168.x.x` — which is how you run this without an
  Apple developer account — the API is refused **no matter what the user
  chooses**. Verified, not assumed: the e2e run grants permission explicitly
  and Chrome still returns `PERMISSION_DENIED`.
  - Chrome reports it as ordinary permission denial, so the client checks
    `window.isSecureContext` *first* and reports `insecure` instead. Without
    that, a LAN user is told they refused a permission they were never asked
    for, and given no way forward.
  - **Typing a ZIP is a first-class path, not a fallback.** It is the only path
    on LAN http, and browsers refuse location far more often than phones do.
    Every failure mode names what happened and what to do instead.

### How a distance is worked out

**Computed by the backend**, not the device (`app/services/provider_geo.py`,
returned as `distance_miles` on each row). They used to be worked out on the
phone from the OS geocoder, which meant the web build showed none at all and a
twenty-row result cost twenty geocoder lookups.

The two ends of the measurement are answered differently, and the difference
is the whole design:

| | Source | Resolution |
|---|---|---|
| The user's end | centroid of the ZIP they searched (`zip_geography`) | one ZIP code |
| The provider's end | their street address, geocoded (`address_geocoder`) | a street address |

- ⛔ **The provider end used to be a ZIP centroid too, and that was a bug users
  saw.** Centroid-to-centroid has **no resolution below one ZIP code**, and
  `search_providers` queries NPPES by the exact ZIP first — so most results sat
  *in* the searched ZIP, and a ZIP's centroid is zero miles from itself. A real
  search of Las Vegas 89109 returned five of six providers at "~0.0 mi", for
  clinics up to three miles apart. The number was not merely imprecise: it was
  the same number for everyone, so it could not be used to choose between them.
  The same search now returns 0.4, 1.6, 1.9, 2.5 and 2.9 miles.
- **The user's end is deliberately still a ZIP centroid.** They typed a ZIP, or
  their coordinate was reduced to one. The honest reading of "~2.5 mi" is
  therefore *"about two and a half miles from the middle of your ZIP code"* —
  close to the truth in a dense urban ZIP, loose in a large rural one. **Keep
  the "~"**, and do not describe these as distances from the user.
- **A zero is never shown.** Where a provider cannot be placed and the ZIP
  estimate would be zero (same ZIP), the answer is `None`, which the client
  already renders as no distance at all. "~0.0 mi" reads as "next door" for a
  clinic that may be three miles away, and `zip_geography` already records that
  a wrong distance is worse than an absent one for someone deciding how far to
  travel while unwell.
- **Failure costs accuracy, never results.** The providers are already fetched
  by the time geocoding runs. An outage, an unplaceable address or an unknown
  ZIP falls back to the centroid estimate; nothing here may fail a search.
- Results are still ordered by distance only, and providers with no distance
  sink to the bottom rather than being dropped.

### Third-party vendor: US Census Bureau geocoder — BAA status

`app/services/address_geocoder.py` sends provider street addresses to
`geocoding.geo.census.gov`. Free, public domain, no key — the same class of
source as NPPES itself. **Flagged here because CLAUDE.md requires any new
third-party service to be named rather than assumed handled.**

- **No user data is transmitted, so no BAA question arises.** The upload is
  id / street / city / state / ZIP, all of it already published by CMS about
  the clinic, plus a pinned benchmark. There is no field on this call that
  could hold a symptom, a tier, an identity or a user location — and a test
  asserts the outbound column set.
- **Do not confuse this with the user's location.** The statement elsewhere in
  this file that *no third-party geocoder is used* is about **the user's
  coordinates**, and remains true: those are still resolved locally against the
  committed Census dataset in `zip_geography`, on both platforms. This vendor
  only ever sees providers' public business addresses.
- What a request does reveal is **which area was searched**, since the
  addresses in one batch share a locality. That is why answers are cached by
  NPI in `provider_locations`: a provider's address does not move, so the same
  area is not re-queried on every search. A warm cache makes zero requests.
- `provider_locations` **has no user column and must never gain one.** Adding
  a `user_id`, or a note of who looked, would turn a table of public addresses
  into a log of which clinics a named person was looking for — health data
  about them. A test asserts the column set.
- It is a batch endpoint: **one request covers a whole page of results**, not
  one per provider.

- **There is no map, on any platform.** Results are a list. Nothing imports
  `react-native-maps` or a JS maps SDK, so there is no native-map-to-web-map
  swap to make. Adding one would need a keyed tile vendor and its own privacy
  review.

- Real-browser coverage lives in `mobile/e2e/web-provider-search.mjs`
  (`npm run e2e:web`). It drives actual Chrome against a real backend and the
  live directory, because secure-context rules and permission prompts cannot be
  observed in jsdom or in devtools' responsive mode. Not part of `npm test`.

### The URGENT tier routes here

`IntakeResultScreen` previously sent URGENT users to their maps app. It now
navigates in-app to provider search, carrying the description forward as the
reason for visit so nobody retypes their symptoms into a second form. The
description is prefilled and **editable** — it was written to answer a triage
question, not to tell a receptionist why you are coming in.

⛔ That block is on a screen this file fences. It changes no disclaimer, no
escalation copy, and no triage or emergency module, and the EMERGENT tier's
routing is untouched. But it changes what an URGENT reader is offered at the
moment they are told to seek care, so **it belongs in the clinical reviewer's
read of that screen** rather than being treated as ordinary UI work.

`urgency_tier` is stored on the appointment as a **label only**. Nothing
re-derives urgency from it, and nothing in this feature may touch the triage
layer.

### Patient identity is pass-through, and must stay that way

A scheduling API cannot book without identifying the patient to the clinic:
legal name, date of birth, sex assigned at birth, phone, email, home address.
MedHelp's answer is **pass-through** — those fields are built from one request,
handed to the delivery layer, and dropped. `app/schemas/booking_identity.py`
is the only place they exist.

The user retypes them per booking. That is the accepted cost of not holding a
table of names, dates of birth and home addresses in a database with no
encryption at rest.

Rules, each asserted by a test in `tests/test_booking_identity.py`:

1. **`appointments` has no column that could hold an identity field**, and
   `BookingIdentity` is not a SQLAlchemy model. The test checks the mapped
   table, so a column added by any route is caught — including near-misses
   like `patient_name` or `dob`.
2. **`AppointmentOut` never carries identity.** Echoing it back would put a
   date of birth into client logs and crash reporters, which is most of the
   exposure that not storing it avoids.
3. **`BookingIdentity.__repr__` is redacted.** pydantic's default prints every
   field, so an identity in a stack frame would leak a name and home address
   into any traceback or `logger.exception` that touched it.
4. **Never put one in a React Navigation param.** Route state is serialisable
   and dev tooling persists it, so a date of birth in a param is a date of
   birth written to disk. The identity screen takes an appointment **id**.
5. **A rejected identity is not echoed back.** The `RequestValidationError`
   handler in `app/main.py` strips the submitted value — it matters more here
   than anywhere else in the app.

**Pass-through is not the same as "not liable."** Transmitting this to a vendor
makes them a processor of PHI just as surely as storing it would. It shrinks
the breach radius; it does not remove the BAA requirement.

### The booking path is built, gated, and unreachable

`POST /appointments/{id}/submit` and `BookingIdentityScreen` exist so the path
is reviewed and tested before the pressure of a live integration — not so it
can collect anything now.

- `delivery_available()` returns False, so the endpoint returns **503 before it
  processes an identity**, and `GET /appointments/capabilities` reports
  `online_booking: false`.
- The app reads that capability and never renders the identity form. **No
  date of birth or home address is collected today.**
- ⛔ **Do not flip `delivery_available()` to unlock the UI.** It is not a
  feature flag; it stands for a signed BAA and a scheduling partnership. Making
  it return True starts transmitting PHI to a vendor with no agreement in place.

### Not reviewed, and PHI status

- Not reviewed by a clinician or by counsel. Provider search authors no
  clinical content and estimates no urgency, so it is not covered by the intake
  blocker — but the URGENT hand-off above is.
- `appointments.reason_for_visit` is free text about someone's symptoms, and in
  the intake flow it is a copy of the intake description. It is **not encrypted
  at rest**, the same open finding as `medications` and `intake_assessments`.
- Real booking would require MedHelp to hold legal name, date of birth, sex
  assigned at birth and address. It holds none of those today, and acquiring
  them is a decision for the user, not an implementation detail.

