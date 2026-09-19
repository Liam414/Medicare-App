# The web layout fills the window it is given (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


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

