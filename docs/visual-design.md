# Visual direction, responsive layout, and the home screen

Detail behind CLAUDE.md, section "Visual direction and layout". The brand work is in brand-guidelines.md.

## Visual direction: paper ground, prominence ladder (implemented)

The 2026 visual pass. Two halves, and they are separable — the surface came
from one explored direction and the structure from another.

**The surface.** The ground moved from a cool blue-grey to a warm paper
(`background` `#F6F2EA`), the type to **Literata** over **Public Sans**, and
depth from drop shadows to hairline rules — `elevation.sm`, which every
resting card used, is now flat. The reasoning is specific to this app rather
than fashionable: every claim MedHelp makes is hedged, so a document that
reads as *written down and attributable* fits it better than a card floating
on a shadow, which reads as a product asserting something.

**The structure.** Every block sits at one of four prominence levels and a
screen gets **exactly one filled action** (`PROMINENCE_LEVELS` in `theme.ts`).
The home screen's four destination cards used to be drawn identically, so
nothing was primary and a reader had to read all four before choosing; it is
now one filled `NavCard variant="primary"` above a `NavGroup` of three rows.

### ⛔ The reviewed safety colours did not move

`emergencyText`, `emergencySurface`, `emergencyBorder`, the `notice*`,
`error*` and `success*` families are byte-for-byte what they were. Only the
neutrals, the type and the depth changed. **Do not restyle a safety family to
match a future direction** — a direction is a preference and those are a
decision someone signed off on.

Also untouched: `DisclaimerBanner.tsx`, the intake disclaimer's copy, palette
and position above the input, `INTAKE_DISCLAIMER`/`ESCALATION_GUIDANCE`, and
every triage and emergency module. Which screens show a disclaimer is
unchanged.

### ⛔ The emergency palette is exempt from the one-filled-action rule

`EmergencyCallBar`'s "Call 911" and the emergency card's contact call stay
filled wherever they appear, however many other filled controls share the
screen. The ladder exists to stop the app shouting; the one thing it may
always shout about is how to get help. On the emergency card that is why
"Edit these details" is `variant="outline"` — it is the third button on a
screen whose other two must not be made ordinary.

### ⛔ Set `fontFamily`, never `fontWeight` or `fontStyle`

Each weight is a separate font file. Asking Android for a bold weight of a
face that is already bold gets a synthetically smeared double-bold, and
`fontStyle: "italic"` shears an upright face rather than using the italic. The
type tokens name families for this reason, and `fonts.serifItalic` exists so
the emergency card's "Not provided" is a real italic.

### ⛔ Import font faces by their per-weight subpath

`@expo-google-fonts/*` package roots `require()` every weight they ship — 16
faces each, italics included — so importing four names from the root bundles
all 32. The first web export after this change carried ~2 MB of fonts nobody
asks for. `App.tsx` imports
`@expo-google-fonts/literata/600SemiBold` and friends instead; the export now
carries exactly the eight faces `theme.ts` names.

`expo-font` is pinned to `~12.0.10`. npm will happily resolve it to 57.x,
which does not work on Expo 51.

### Nothing renders until the faces load, but a font failure never blocks

`App.tsx` gates on `useFonts`. Every type token names a family, so a screen
painted before the faces land is painted at the wrong metrics and reflows
under the reader. A *failure* is different from a wait: if the faces cannot
load at all the app opens anyway on the system font, because blocking the
emergency card behind a font download would be indefensible.

### The serif is the app quoting; the sans is the app speaking

Literata is used only for text a person wrote or a source published — what
the user typed into the symptom field (`typography.bodyQuoted`, applied to
any `multiline` `TextField`), the values on their emergency card, a
destination's name. Single-line fields stay in the sans: an email or a ZIP is
data, not prose.

### Two things a reviewer should be told

- **`typography.overline` stayed at 13px.** The direction drew section labels
  at 11px; that was not adopted, because the 13px floor is an accessibility
  decision — small uppercase type is the first thing to fail for anyone with
  low vision — and it outranks a mockup.
- **One line of new user-facing copy** was added under the symptom field:
  "Your own words. Nothing here is rewritten before it is assessed." It
  describes existing behaviour (keyword extraction only chooses which article
  to look up), and it is asserted by a test so that anything which later
  paraphrases a description on the way in has to remove the claim too. It is
  not clinical content, but it is a statement about the instrument and
  belongs in the same reviewer's read as the intake screen.

## The web layout fills the window it is given (implemented)

Every screen used to be one column capped at 620pt, on a phone and on a
1440pt browser window alike, so the browser build was a narrow strip of
content with empty background either side.

`useBreakpoint()` (`mobile/src/hooks/useBreakpoint.ts`) reports which of three
shapes the layout should take, from the **window width** — not from
`Platform.OS`, which would be the wrong question twice: a browser window
dragged narrow should get the phone layout, and a tablet should get the wide
one. `BREAKPOINT` lives in `theme.ts`.

- Below `medium` (760): unchanged. Every screen is the single stacked column
  it has always been, and every existing test renders at this width.
- At `medium`: the home screen's destination cards sit two across.
- At `expanded` (1040): the home screen splits into columns, and sign-in and
  sign-up become two panels — what the app is on the left, the form on the
  right.

`CONTENT_WIDTH.page` and `Screen`'s `page` prop exist for the second case only.
⛔ Do not pass `page` to make a lonely-looking form or list wider: `form` and
`wide` are line-length limits, and a 1140pt line of body text is harder to read
than a 660pt one. Only a screen whose children actually split into columns
should use it.

### ⛔ What may fill the space

The panels added to the home screen (`InfoPanel`) are **statements about the
software**: what the app does, what it deliberately does not do, and where data
goes. Each restates something the repository already says rather than adding a
new claim — the "will not do" list is this file's App Scope, and the data lines
are the on-device-scanning and provider-search rules.

Two things must never fill this space, and the note at the top of `InfoPanel`
says so where someone would be editing:

- **Clinical content.** An agent may not author symptom, condition or dosage
  text at all, and the sourced text the app does show is rendered verbatim
  with attribution — which is not what a decorative panel does.
- **Numbers about the user's health.** MedHelp does not know whether a dose was
  taken. A "3 of 4 taken today" tile would invent a clinical fact about the
  user, and is the same mistake the home screen's hero comment has always
  warned against.

The intake screens were deliberately left alone. Their disclaimer placement is
part of what this file fences ("which screens show them"), and moving a
required disclaimer into a side column changes its prominence, which is a
reviewer's call and not a layout one.

## The home screen is four things you can press (implemented)

The home screen used to be a dashboard: four destination cards, three
explanatory panels, a hero and a sign-out button, all visible at once. It is
now a small set of primary actions, with everything else one tap deeper on
`MoreScreen`.

| Home | More |
|---|---|
| Not feeling well? → `SymptomIntake` | My medications → `MedicationList` |
| Add medication → `MedicationEdit` | Medication reminders → `MedicationReminders` |
| Upcoming appointments → `AppointmentList` | All appointments → `AppointmentList` |
| More → `MoreScreen` | Find a provider → `ProviderSearch` |
| Emergency card → `EmergencyCard` | Emergency card, and editing it |
| | Sign out, and the two scope panels |

### ⛔ This is a move, not a removal

Every destination that came off the home screen is on `MoreScreen`, named in
full, one tap away. **No route was renamed, removed, or re-parameterised**, so
nothing that navigated anywhere before the reshuffle navigates anywhere
different now — the intake-to-booking flow in particular is untouched.

`__tests__/navigationReachability.test.ts` holds this mechanically. It reads
the navigator's registrations and every `navigate` / `replace` / `reset`
target across `src`, and fails when a registered route has no way in, or when
something navigates to a route that is not registered. The failure mode of a
reshuffle is not a crash — it is a screen that is still registered, still
tested, still perfect, and that nothing reaches any more, so everything passes
and nobody notices.

`ROOTS` in that file names the routes entered without anyone navigating to
them (`Login` and `Home`, which is what `initialRouteName` chooses between).
Adding to that list is how a route is declared intentionally unreachable by
`navigate`; it should stay short.

Nothing is nested deeper than More. A flat list of named destinations is
findable; a menu of menus is not.

### ⛔ A screen that hides the navigator header owns its own way back

Reachability has two directions, and the first version of that test only
checked one. It asked whether every route could be navigated *to*; it never
asked whether you could get *out*.

`EmergencyCard` sets `headerShown: false`, so its red header is not doubled by
the navigator's — which also removes the back button. **A browser has no
back gesture to fall back on, so the screen had no way out at all**: every
control on it went deeper. Nothing failed, no test caught it, and the whole
suite was green. It was found by opening the screen in a browser.

The screen now draws its own "‹ Back" inside the red header, above the title
so it is reachable without scrolling however long the card grows.
`navigationReachability.test.ts` reads the navigator for screens that set
`headerShown: false` and asserts each one calls `goBack` itself, and
`EmergencyCardScreen.test.tsx` presses it.

**Anything that turns the header off inherits this obligation.** The three
other headerless screens are exempt for a real reason rather than by
oversight: `Login` and `Home` are what `initialRouteName` chooses between, so
there is nothing behind either of them, and `Login` and `Signup` each carry an
explicit link to the other in the body of the screen. `EmergencyCard` had
neither property, which is what made it a dead end.

### ⛔ "Add medication" opens the form, not the list

The card names an action, so it performs it: `MedicationEdit` with no
parameters, which is the add form. Routing it through the list would make it
two taps for the thing the card says. The list is on More.

### ⛔ The inline appointment is not "the next one"

`IntakeResultScreen`'s URGENT hand-off and the appointment list both rest on
the fact that **MedHelp does not know when an appointment is**.
`preferred_time` is free text by design ("Thursday morning", "as soon as
possible"), and there is no scheduled datetime on the record — the appointment
rules fence adding one ("Do not add a slot picker, a 'Book now' button, or a
time, until a real scheduling integration exists behind it") precisely because
a time this app invents is a time someone turns up for.

So the home screen shows the most recently *recorded* open appointment, under
the label **MOST RECENTLY RECORDED**, with the provider name and the preferred
time rendered verbatim. It does not say "Next", and a test asserts it does not.
This is the one part of the requested design that could not be built as
described, and the reason is a fence rather than an oversight.

It also repeats "MedHelp has not contacted anyone" for a REQUESTED
appointment, which is the same line the list carries on every card and for the
same reason: a list is skimmed, and whether the clinic knows is the one thing
a user must not misread.

The lookup **fails silently**. The home screen's job is to be four things you
can press; an error notice there would put a red box on the first screen of
the app over a line of supporting detail, and `AppointmentListScreen` reports
its own failures properly when opened.

### What filled the space, and what moved

The panels are unchanged in content — see "⛔ What may fill the space" above,
which still governs them. What changed is where they are:

- **"What MedHelp will not do" stayed**, beside the actions on a wide window
  and stacked under them on a phone. It restates App Scope, and that is the
  thing worth saying on the way in.
- **"How MedHelp works" and "Where your information goes" moved to More.**
  They are onboarding rather than everyday content.
- ⛔ The panel that stayed is kept at **every** width. Dropping it below
  `BREAKPOINT.expanded` would have been a tidier consolidation and would have
  quietly made the scope statement a desktop-only feature —
  `responsiveLayout.test.tsx` already asserted against exactly that, on the
  grounds that a narrower screen is not a reason to stop saying what the app
  will not do. That assertion was kept rather than rewritten.

The short scope note at the foot of the screen is unchanged and still present
at every width. The reviewed `DisclaimerBanner` is not on this screen and was
not moved onto or off it — which screens show it is fenced.

### Sign out moved to More, and does not clear the emergency card

`MoreScreen` resets the navigation stack to `Login` rather than navigating, so
the back gesture cannot walk into signed-in screens — unchanged behaviour,
new location.

⛔ It deliberately does **not** clear the emergency card, which lives in a
separate store and is meant to outlive a session. The screen says so, because
on a shared computer that is a surprise worth naming, and points at "Erase
this card".

