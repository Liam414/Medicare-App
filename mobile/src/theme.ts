/**
 * Design tokens for MedHelp.
 *
 * This is a health app that people may open while worried or in a hurry, so
 * the type scale is a little larger than a typical consumer app and colour is
 * never the only carrier of meaning — errors and emergencies also change
 * wording and iconography.
 *
 * ## The 2026 "bright card" pass
 *
 * The app was previously a **panel**: cool porcelain ground, ruled chart
 * paper, a coloured measurement rule down the leading edge, and a grotesque
 * paired with a reading serif. It was coherent and it was sombre. This pass
 * replaces it with the shape language of a consumer habit app — the one a
 * person actually opens five times a week:
 *
 * 1. **The ground is plain white and the cards are grey.** Not the other way
 *    round. A resting card is a soft `surface` fill with no border; the page
 *    behind it is `background`. That inversion is most of why the screens
 *    read as light rather than as documents.
 * 2. **Radii went up and borders got thicker.** 16pt on a card, 2pt when a
 *    border is doing work. A 1pt hairline is a document; a 2pt round-cornered
 *    block is a control you press.
 * 3. **A primary button has a solid bottom edge** (`EDGE_WIDTH`), drawn in
 *    the pressed colour. It is the one skeuomorphic thing here and it earns
 *    its place: it says "press me" without a shadow, which is the only depth
 *    cue that survives greyscale and high-contrast modes.
 * 4. **The chart-paper ground and the edge meter are gone.** Both were
 *    measurement metaphors for an app that mostly tells you where to go.
 *
 * ## ⛔ Contrast: the fills are darker than the source mockups, deliberately
 *
 * The reference design used Duolingo's palette — `#58CC02` green and
 * `#1CB0F6` blue. White text on those is **2.1:1 and 2.4:1**, which fails
 * WCAG AA (4.5:1) and even AA-large (3:1). This app is read by people who are
 * unwell, on phones, often outdoors, and it already promised AA throughout.
 *
 * So each destination carries **two values of the same hue**:
 *
 * - `fill` / `ink` are darkened to clear 4.5:1 against white text and against
 *   that destination's own tint. These are the only values text ever touches.
 * - `bright` is the mockup value, untouched, used for marks that carry **no
 *   text** — an active tab pip, a rule, a decorative tile.
 *
 * Flip `bright` into `fill` and the palette is pixel-exact to the reference
 * and no longer accessible. That is a product decision, not an engineering
 * one; it is one line per hue if somebody makes it.
 *
 * ⛔ **The notice, error, success and emergency families are byte-for-byte
 * what a reviewer signed off on** and were not touched by this pass, because
 * those carry safety meaning. Only the neutrals, the accents, the shape and
 * the depth changed. Anyone revisiting the palette should keep that line.
 */

export const colors = {
  // Surfaces. ⛔ The page is white and a card is grey — the inverse of the
  // panel pass. A component that hardcodes white for a card will disappear.
  background: "#FFFFFF",
  surface: "#F7F7F7",
  surfaceMuted: "#F0F0F0",
  /** Page ground behind a hero panel — one step darker than `surfaceMuted`. */
  surfaceSunken: "#EBEBEB",

  // Text — on `background` unless noted
  textPrimary: "#3C3C3C", // 11.0:1 on white, 10.3:1 on surface
  textSecondary: "#666666", // 5.7:1 on white, 5.4:1 on surface
  /**
   * Quietest readable ink — section labels and footnotes. 5.3:1 on white,
   * 5.0:1 on `surface`, 4.7:1 on `surfaceMuted`, which is the worst ground it
   * lands on and the one that set this value.
   *
   * ⛔ The reference design set this at `#8E8E8E` (3.3:1). That is below AA
   * for body text and this is the colour most of the app's explanatory copy
   * is set in. Kept darker on purpose; do not "match the mockup" here.
   */
  textMuted: "#6B6B6B",
  textOnAccent: "#FFFFFF",
  /**
   * Secondary text on a filled panel.
   *
   * ⛔ It is **pure white**, and it has to be. `accent` is the lightest green
   * that clears 4.5:1 against white text at all (it lands at 4.52), so any
   * tint dimmer than white on that ground is below AA by construction. The
   * hierarchy between a panel's heading and its secondary line is therefore
   * carried by size and weight, never by fading the ink.
   *
   * Kept as its own token rather than collapsed into `textOnAccent` so the
   * next person to reach for a muted tint on a coloured panel finds this note
   * instead of inventing one.
   */
  textOnAccentMuted: "#FFFFFF",

  // Lines. A resting card has no border at all; these are for the cases
  // where a border is carrying meaning (selected, focused, dashed-empty).
  border: "#E5E5E5",
  borderStrong: "#C7C7C7",
  borderFocus: "#3A8701",
  /** Hairline between rows inside one card. */
  divider: "#EDEDED",

  // The app-wide primary action. This is the Today hue, which is also the
  // first stop on the domain ramp — see `domains`. A screen inside a
  // destination overrides it with that destination's own colour.
  accent: "#3A8701", // white on this: 4.5:1
  accentPressed: "#2E6B01",
  accentDisabled: "#D4D4D4",
  /** Header/hero ground. White on this: 4.5:1. */
  accentDeep: "#3A8701",
  /** Tinted fill for icon tiles and quiet accent chips. `accent` on it: 4.5:1. */
  accentSurface: "#E8F7D9",
  accentBorder: "#A9E06B",

  // ⛔ Everything below this line is reviewed safety colour. Do not restyle
  // it to match a new visual direction — a direction is a preference and
  // these are a decision someone signed off on. The bright-card pass left
  // every value here exactly as it found it.

  // Errors: used for "this didn't work", not for medical urgency
  errorText: "#8C1D18", // 8.6:1
  errorSurface: "#FDECEA",
  errorBorder: "#E9A29B",

  // Confirmations
  successText: "#14532D", // 9.7:1 on successSurface
  successSurface: "#E7F4EA",
  successBorder: "#7FB98B",

  // Disclaimers: informational, must stay legible, never alarming
  noticeText: "#5E3D07", // 8.4:1 on noticeSurface
  noticeSurface: "#FFF6E5",
  noticeBorder: "#E0A02C",

  // Emergency: reserved exclusively for call-emergency-services guidance
  emergencyText: "#7A1610",
  emergencySurface: "#FDE7E5",
  emergencyBorder: "#C5362C",
} as const;

/**
 * ## One hue per destination
 *
 * The five places a signed-in person can be each own a colour.
 *
 * ### ⛔ A hue means a *place*, never a state and never a health fact
 *
 * `domains.medications` means "you are in Medications". It must never come to
 * mean "this medication needs attention", and no row, badge or chip may be
 * tinted by urgency, adherence, severity or any reading of the person's
 * health. MedHelp does not know whether a dose was taken; a colour that
 * implied it would be inventing a clinical fact, which is the same fence the
 * Today screen and `InfoPanel` already carry.
 *
 * ### The four roles
 *
 * - `ink` — the hue as **text or an icon** on `background`, `surface`, or its
 *   own `surface` tint. Cleared against the worst of those three.
 * - `fill` — a ground for **white text**. Cleared at 4.5:1.
 * - `edge` — the solid bottom edge under a filled button, and the pressed
 *   state. Always darker than `fill`.
 * - `bright` — ⛔ **decoration only, never behind or under text.** This is the
 *   reference design's original value and most of them fail AA. It is here so
 *   an active tab pip or a rule can be the vivid colour the design wants
 *   without putting a word on top of it.
 * - `surface` / `border` — the quiet tinted chip.
 *
 * ### ⛔ Green now means "Today", and no longer means "success" alone
 *
 * The panel pass kept the destination ramp entirely cool so that any warm or
 * green element in the app necessarily carried safety meaning. This pass
 * gives Today a green, which spends that property. What replaces it: the
 * reviewed families above each keep a *distinct ink, tint and border* and are
 * always rendered as a bordered notice block, never as a filled button. A
 * `SuccessNotice` and a primary button are different shapes, not just
 * different greens. Keep it that way.
 */
export const domains = {
  today: {
    ink: "#377E01",
    fill: "#3A8701",
    pressed: "#2E6B01",
    edge: "#2E6B01",
    surface: "#E8F7D9",
    border: "#A9E06B",
    bright: "#58CC02",
  },
  symptoms: {
    ink: "#1274A2",
    fill: "#147DAF",
    pressed: "#0F6488",
    edge: "#0F6488",
    surface: "#DDF4FF",
    border: "#8ED2F2",
    bright: "#1CB0F6",
  },
  medications: {
    ink: "#7C4DDC",
    fill: "#7C4DDC",
    pressed: "#6B3FD0",
    edge: "#6B3FD0",
    surface: "#F3EEFF",
    border: "#C9AFF7",
    bright: "#7C4DDC",
  },
  care: {
    ink: "#C4197E",
    fill: "#C4197E",
    pressed: "#9C1264",
    edge: "#9C1264",
    surface: "#FCE3EF",
    border: "#F7C5E3",
    bright: "#C4197E",
  },
  goals: {
    ink: "#00795C",
    fill: "#0B8378",
    pressed: "#08655C",
    edge: "#08655C",
    surface: "#D7F2E3",
    border: "#8BDCC2",
    bright: "#00CD9C",
  },
} as const;

export type DomainName = keyof typeof domains;
export type Domain = (typeof domains)[DomainName];

/**
 * The faces, by their loaded family names.
 *
 * ⛔ **Set `fontFamily`, never `fontWeight`.** These are separate font files
 * per weight, and asking Android for a bold weight of a face that is already
 * bold gets you a synthetically smeared double-bold.
 *
 * **Archivo** is a grotesque drawn from nineteenth-century American gothics
 * and built for high-performance signage — the right voice for an app whose
 * main job is telling you where to go. It is tight enough to hold a dense
 * medication list and sturdy enough to set a screen title at 32pt.
 *
 * ## ⛔ The reading serif was dropped by the bright-card pass
 *
 * The panel pass used Newsreader for "text a person wrote or a source
 * published" — the symptom field, emergency card values, a MedlinePlus
 * summary — so that the serif was the app *quoting* and the sans was the app
 * *speaking*. That was a good rule and it is gone, because the reference
 * design sets quoted text in the same sans as everything else.
 *
 * The `serif*` keys survive pointing at Archivo so that no call site had to
 * change. **What replaces the signal:** quoted text is still a distinct
 * token (`typography.bodyQuoted`) at a larger size with more leading, and it
 * is still only ever used for words the app did not write. If the serif comes
 * back, it comes back by repointing these four keys and nothing else.
 */
export const fonts = {
  serif: "Archivo_400Regular",
  serifItalic: "Archivo_400Regular",
  serifSemibold: "Archivo_600SemiBold",
  serifBold: "Archivo_700Bold",
  sans: "Archivo_400Regular",
  sansMedium: "Archivo_500Medium",
  sansSemibold: "Archivo_600SemiBold",
  sansBold: "Archivo_700Bold",
  sansExtrabold: "Archivo_800ExtraBold",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const;

/**
 * Corner radii, **differentiated by what a thing is** rather than one value
 * applied to everything. A single radius across an interface flattens its
 * hierarchy: a chip, a card and a full-bleed panel are not the same kind of
 * object and should not share an outline.
 *
 * The bright-card pass roughly doubled these. A 10pt button is a form
 * control; a 16pt one is a thing you press with a thumb.
 */
export const radius = {
  /** Chips, small tiles. */
  sm: 10,
  /** Inputs and buttons — a control you put a finger on. */
  md: 16,
  /** Cards and grouped lists. */
  lg: 16,
  /** A panel that owns the width of the screen. */
  xl: 20,
  pill: 999,
} as const;

/**
 * Border weight when a border is doing work — a selected row, a focused
 * input, a dashed empty state. A resting card has **no** border; it is
 * separated from the white page by its own grey fill.
 */
export const BORDER_WIDTH = 2;

/**
 * The solid bottom edge under a filled button and under a pressed-in card.
 *
 * ⛔ It is drawn with `borderBottomWidth`, not a shadow, so it survives
 * greyscale, forced-colours and high-contrast rendering — which a shadow does
 * not. A button that loses its only affordance in a high-contrast mode is a
 * button a low-vision user cannot find.
 */
export const EDGE_WIDTH = 4;

/**
 * Figures that line up in a column. Times, doses, dates and counts are read
 * down a list rather than along a line, so they are set with tabular
 * (fixed-width) numerals; proportional figures make a column of 08:00 /
 * 11:15 / 20:00 jitter left and right.
 */
const TABULAR = { fontVariant: ["tabular-nums"] as "tabular-nums"[] };

export const typography = {
  /** The greeting on a filled hero panel. */
  band: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  displayLarge: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  display: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  titleSmall: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  /**
   * Body copy at 17pt rather than 16pt. NHS sets its standard paragraph at
   * 19px and this app is read by people who are unwell; a step up costs a
   * line of wrapping and buys legibility.
   */
  body: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 26 },
  bodyStrong: { fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 26 },
  /**
   * Text the *user* wrote, or that a source published, shown back to them.
   * Larger and more leaded than `body` so it is visibly a quotation even
   * though the serif that used to carry that distinction is gone — see the
   * note on `fonts`.
   */
  bodyQuoted: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 29 },
  caption: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  captionStrong: { fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 21 },
  /**
   * The label on a filled button. Bold and slightly tracked — at this weight
   * a little letter-spacing stops a short all-caps-feeling label closing up.
   */
  button: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  /**
   * A short value read at a glance — a dose, a time, a blood type.
   * Bold, tracked, and tabular so a column of them scans cleanly.
   */
  data: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.2,
    ...TABULAR,
  },
  /** A time or a count set large enough to be the thing you look at. */
  dataLarge: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
    ...TABULAR,
  },
  /**
   * Section label above a group of cards.
   *
   * ⛔ The 13px floor is an accessibility decision and outranks any mockup;
   * a previous visual direction drew these at 11px and was not adopted.
   *
   * **Sentence case, not upper.** Uppercasing a label costs legibility — the
   * word loses its outline shape, which is most of what makes it readable at
   * a glance — and buys only the look of a label.
   */
  overline: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
} as const;

/**
 * Depth presets.
 *
 * ## Deliberately almost flat
 *
 * Structure is carried by the grey-card-on-white-page inversion, by the
 * prominence ladder, and by `EDGE_WIDTH` under a pressable — not by shadow.
 * `sm`, which every resting card uses, is flat.
 *
 * Depth is decoration only. Nothing in this app uses a shadow to signal
 * urgency, state, or hierarchy that isn't also carried by text.
 */
export const elevation = {
  /** Explicitly flat — cancels a preset inherited from a base style. */
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Resting cards and inputs — flat, separated by their fill instead. */
  sm: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Raised: hovered cards. */
  md: {
    shadowColor: "#3C3C3C",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Floating: sticky bars. */
  lg: {
    shadowColor: "#3C3C3C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
} as const;

/**
 * ## The prominence ladder
 *
 * Every block on every screen sits at one of four levels, and **a screen gets
 * exactly one level-one action**. Without it, a screen's destinations are
 * drawn identically, nothing is primary, and the reader has to read all of
 * them to choose one.
 *
 *   L1  ACT      filled in the screen's domain colour with an `edge`. One per screen.
 *   L2  READ     `surface` fill, no border. Titled blocks and rows.
 *   L3  CONTEXT  `surfaceMuted` fill. Supporting detail.
 *   L4  FINE     no fill; a `divider` hairline above it. Footnotes.
 *
 * ⛔ **The emergency palette is exempt.** `EmergencyCallBar`'s "Call 911" and
 * the emergency card's contact call stay filled wherever they appear, however
 * many other filled controls are on screen. The rule exists to stop the app
 * shouting; the one thing it may always shout about is how to get help.
 *
 * These are documentation, not a component — a level is expressed with the
 * tokens above in each component's own stylesheet, because "which level is
 * this" is a judgement per block and a `<Level n={2}>` wrapper would make it
 * look mechanical.
 */
export const PROMINENCE_LEVELS = 4;

/**
 * Minimum interactive size. Apple's HIG asks for 44pt and Android's Material
 * guidance for 48dp; using the larger value satisfies both and helps users
 * with reduced dexterity or a shaking hand.
 */
export const MIN_TAP_TARGET = 48;

/**
 * Content column widths.
 *
 * `form` and `wide` are line-length limits: a text input or a paragraph that
 * runs the full width of a desktop browser is genuinely harder to read, so
 * those two stay narrow however big the window is.
 *
 * `page` is different in kind. It is for a screen that lays *columns* out
 * beside each other rather than stretching one column — the Today screen does
 * this above `BREAKPOINT.expanded`.
 */
export const CONTENT_WIDTH = { form: 480, wide: 660, page: 1180 } as const;

/**
 * Viewport widths where the layout changes shape.
 *
 * These are window widths, not device classes: the same browser window
 * crossing 760px gets the two-column layout whether it is a tablet or a
 * desktop, and a phone never does. Screens read them through
 * `useBreakpoint()`.
 */
export const BREAKPOINT = { medium: 760, expanded: 1040 } as const;

/**
 * Sizes for the round icon tile that fronts a row — the "Rx" disc on a
 * medication, the dot on an appointment.
 *
 * ⛔ **Whatever a tint says, the row says in words too.** A row may be tinted
 * by something the user themselves entered — a reminder time they set has come
 * round, a refill date they wrote down has passed — but the same fact is
 * always written beside it ("Due now", "Refill due in 3 days"). Nothing here
 * may be tinted by a reading of the person's *health*, which MedHelp does not
 * have: no severity, no adherence, no urgency of its own invention.
 */
export const TILE = { sm: 36, md: 44, lg: 56, xl: 88 } as const;
