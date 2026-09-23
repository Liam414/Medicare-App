/**
 * The phone's red-flag screen must answer exactly as the server's does.
 *
 * The parity cases are descriptions the export ran through the real Python
 * `screen_for_emergency`; each carries the category it returned. Disagreeing
 * with any of them is a failure, in either direction.
 */

import rules from "@/generated/emergencyRules.json";
import { screenLocally } from "@/services/emergencyScreen";

describe("offline red-flag screening", () => {
  const cases = rules.parity as { text: string; category: string | null }[];

  it("has parity cases on both sides of the line", () => {
    expect(cases.filter((c) => c.category).length).toBeGreaterThan(40);
    expect(cases.filter((c) => !c.category).length).toBeGreaterThan(40);
  });

  it.each(cases.map((c) => [c.text, c.category]))(
    "%j → %s, as the server answers",
    (text, category) => {
      expect(screenLocally(text as string)?.category ?? null).toBe(category);
    }
  );

  it("agrees with the server across a sample of the common-illness corpus", () => {
    // One assertion over ~2,800 rows rather than 2,800 tests; the message
    // names every disagreement.
    const large: [string, string | null][] = require("./fixtures/emergencyParityLarge.json");
    expect(large.length).toBeGreaterThan(2000);
    const disagreements = large
      .filter(([text, category]) => (screenLocally(text)?.category ?? null) !== category)
      .map(([text, category]) => `${JSON.stringify(text)} server=${category}`);
    expect(disagreements).toEqual([]);
  });

  it("⛔ shows the reviewed copy word for word, never its own", () => {
    const guidance = screenLocally("I have chest pain");
    const rule = rules.rules.find((r) => r.category === "cardiac")!;
    expect(guidance).toEqual({
      category: "cardiac",
      headline: rule.headline,
      action: rule.action,
    });
  });
});
