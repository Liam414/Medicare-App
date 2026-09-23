/**
 * Interface languages. See the note at the top of `src/i18n/strings.ts`:
 * Spanish ships switched off because red-flag screening reads English only.
 */

import { SPANISH_UI_ENABLED, translate, translateWith, type StringKey } from "@/i18n/strings";

describe("the Spanish switch", () => {
  it("⛔ is off in this build", () => {
    expect(SPANISH_UI_ENABLED).toBe(false);
  });

  it("⛔ gives English even for a stored Spanish choice while it is off", () => {
    // Screening cannot read Spanish yet; a Spanish screen would invite it.
    expect(translate("intake.title", "es")).toBe("What's going on?");
  });

  it("gives Spanish when a build turns it on", () => {
    expect(translateWith("intake.title", "es", true)).toBe("¿Qué le está pasando?");
  });
});

describe("the Spanish table", () => {
  const keys: StringKey[] = [
    "tab.Today", "tab.Symptoms", "tab.Medications", "tab.Care", "tab.Goals",
    "today.greeting", "today.heroTitle", "today.heroBody", "today.heroButton",
    "today.medicationTimes", "today.people", "intake.title", "intake.subtitle",
    "intake.submit", "intake.past", "language.label",
  ];
  const es = (key: StringKey) => translateWith(key, "es", true);
  const en = (key: StringKey) => translateWith(key, "en", true);

  it("translates every interface string, so switching it on is not half-done", () => {
    for (const key of keys) expect(es(key)).not.toBe(en(key));
  });

  it("⛔ holds no safety or emergency copy — that stays as reviewed", () => {
    for (const key of [...keys, "language.notice" as const]) {
      expect(es(key)).not.toMatch(/911|988|emergencia|llame/i);
    }
  });

  it("says, in Spanish, that it is unreviewed and that safety notices stay in English", () => {
    expect(es("language.notice")).toMatch(/sin revisión/);
    expect(es("language.notice")).toMatch(/avisos de seguridad aparecen en inglés/);
  });
});
