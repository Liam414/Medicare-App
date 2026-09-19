# Visual direction: paper ground, prominence ladder (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


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

