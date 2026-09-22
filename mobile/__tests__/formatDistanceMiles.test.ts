import { formatDistanceMiles } from "@/services/providerService";

/**
 * ⛔ CLAUDE.md: "Distance only, always rendered with a '~', and a zero is
 * never shown."
 *
 * It had been implemented twice, once per screen, and neither copy enforced
 * the second half: `formatDistance(0.0138)` returned "~0.0 mi", because
 * `toFixed(1)` rounds it to zero. The backend suppresses an exact 0.0, so the
 * only way to see this was a true distance under a tenth of a mile.
 *
 * A rendered zero reads as "next door" for a clinic that may be several
 * streets away, and this exact page has shipped before: when the provider end
 * was still a ZIP centroid, every same-ZIP result measured exactly zero and
 * the whole list read "~0.0 mi".
 */
describe("formatDistanceMiles", () => {
  it("never renders a zero, however small the true distance", () => {
    for (const miles of [0, 0.0001, 0.0138, 0.04, 0.049]) {
      const shown = formatDistanceMiles(miles);

      expect(shown).not.toContain("0.0");
      expect(shown).toBe("~0.1 mi");
    }
  });

  it("always carries the tilde, at every magnitude", () => {
    for (const miles of [0, 0.5, 9.9, 10, 42, 1000]) {
      expect(formatDistanceMiles(miles)).toMatch(/^~/);
    }
  });

  it("renders no distance at all when there is none", () => {
    // ⛔ Null is an ordinary outcome, not an error: a provider that could not
    // be placed has no distance, and inventing one would be worse.
    expect(formatDistanceMiles(null)).toBeNull();
  });

  it("keeps one decimal below ten miles and rounds above it", () => {
    expect(formatDistanceMiles(0.5)).toBe("~0.5 mi");
    expect(formatDistanceMiles(3.14)).toBe("~3.1 mi");
    expect(formatDistanceMiles(9.99)).toBe("~10.0 mi");
    expect(formatDistanceMiles(10)).toBe("~10 mi");
    expect(formatDistanceMiles(42.4)).toBe("~42 mi");
  });

  it("never understates the journey", () => {
    // The floor rounds up rather than down, which is the safe direction for
    // someone judging whether they can get there while unwell.
    for (const miles of [0.01, 0.02, 0.049]) {
      const shown = Number(formatDistanceMiles(miles)!.replace(/[^\d.]/g, ""));

      expect(shown).toBeGreaterThanOrEqual(miles);
    }
  });
});
