/**
 * Every text-on-background pair in the palette stays readable.
 *
 * ⛔ WHY THIS MATTERS MORE HERE THAN IN AN ORDINARY APP. These screens are
 * read by somebody who is unwell, often in a hurry, sometimes by a stranger
 * holding the phone in an emergency. `theme.ts` already records the ratios in
 * comments — "15.6:1", "6.9:1" — and `docs/visual-direction.md` justifies the
 * emergency card's header ground by arguing it "gives white text 10.8:1 where
 * the lighter border colour would give 5.3:1".
 *
 * All four of those numbers are correct today. Nothing was checking them, so
 * the next palette change checks them by eye or not at all, and a contrast
 * regression is invisible to everyone who does not already have the problem it
 * causes.
 *
 * ⛔ THE EMERGENCY FAMILY IS THE POINT. CLAUDE.md fences those colours — "do
 * not restyle a safety family to match a future direction" — and this is the
 * mechanical half of that rule. A direction is a preference; a legible
 * instruction to call 911 is not.
 *
 * Thresholds are WCAG 2.1 AA for normal text (4.5:1). Where a pair already
 * clears AAA (7:1) the test says so rather than silently accepting a later
 * drop to 4.5.
 */

import { colors } from "@/theme";

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4)
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA = 4.5;
const AAA = 7;

/**
 * (label, foreground, background, floor).
 *
 * The floor is AAA where the pair already clears it, so a later change that
 * drops it to merely-AA is a decision somebody has to make on purpose rather
 * than a number quietly sliding.
 */
const PAIRS: [string, string, string, number][] = [
  // ⛔ The emergency family. Fenced by CLAUDE.md, read under stress.
  ["white on the emergency header ground", "#FFFFFF", colors.emergencyText, AAA],
  ["emergency text on its surface", colors.emergencyText, colors.emergencySurface, AAA],
  // Ordinary body text.
  ["primary text on the page ground", colors.textPrimary, colors.background, AAA],
  ["primary text on a card", colors.textPrimary, colors.surface, AAA],
  ["secondary text on the page ground", colors.textSecondary, colors.background, AA],
  ["secondary text on a card", colors.textSecondary, colors.surface, AAA],
];

describe("colour contrast", () => {
  it.each(PAIRS)("%s is legible", (_label, foreground, background, floor) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(floor);
  });

  it("the ratio recorded beside the emergency ground is the real one", () => {
    // docs/visual-direction.md: "gives white text 10.8:1 where the lighter
    // border colour would give 5.3:1". Both halves, because the argument for
    // the chosen colour is the COMPARISON, not either number alone.
    expect(contrast("#FFFFFF", colors.emergencyText)).toBeCloseTo(10.8, 1);
    expect(contrast("#FFFFFF", colors.emergencyBorder)).toBeCloseTo(5.3, 1);
  });

  it("the ratios written in theme.ts are the real ones", () => {
    // theme.ts annotates these two inline. A comment that drifts from the
    // value beside it is worse than no comment.
    expect(contrast(colors.textPrimary, colors.background)).toBeCloseTo(15.6, 1);
    expect(contrast(colors.textSecondary, colors.background)).toBeCloseTo(6.9, 1);
  });

  it("the checker itself is not broken", () => {
    // Guards the guard: a luminance bug that returned a constant would make
    // every assertion above pass.
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 1);
  });
});
