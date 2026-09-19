# The home screen is four things you can press (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


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

