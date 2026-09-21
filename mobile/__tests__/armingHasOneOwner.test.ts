/**
 * `reminderArming` is the only module that arms notifications.
 *
 * ⛔ WHY THIS READS SOURCE INSTEAD OF BEHAVIOUR. The rule is about who is
 * allowed to import a function, and no amount of rendering can observe that.
 * It is the same reason `accessibleState.test.ts` reads source: the property
 * is structural, so the test has to be too.
 *
 * ## The bug this prevents, which already happened once
 *
 * `scheduleAll` REPLACES everything — `cancelAll()` runs first, and on native
 * that is `cancelAllScheduledNotificationsAsync`, which does not distinguish
 * dose reminders from refill alerts. So two arming functions each handling a
 * subset would take turns cancelling each other's work.
 *
 * The symptom is not a crash. It is a notification type that silently stops
 * firing depending on which screen was opened last. `docs/medication-reminders.md`
 * records the previous instance: arming lived in one screen's focus effect, so
 * somebody who set their times and then opened the app on any other tab had
 * nothing armed at all. Playtesting found it as "reminders that were saved,
 * listed correctly on screen, and never delivered".
 *
 * ⛔ MORE CALLERS OF `rearm` ARE FINE. The rule is not "one caller" — that was
 * tried and was the wrong half to enforce, which is why `rearm()` now also
 * runs at app start from `RootNavigator`. The rule is that every arm sends the
 * COMPLETE set, and the way that is guaranteed is one function owning the call
 * to `scheduleAll`.
 *
 * This asserts the ownership. `reminderArming.test.ts` asserts the rest:
 * that runs are serialised, and that a partial failure still arms what it can.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SOURCE = join(__dirname, "..", "src");

/** The one module allowed to import and call it. */
const OWNER = join("services", "reminderArming.ts");

/** Where it is defined. A definition is not a call site. */
const DEFINITIONS = [
  join("services", "notificationService.ts"),
  join("services", "notificationService.web.ts"),
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Lines that are code rather than prose.
 *
 * Several files mention `scheduleAll` in a comment explaining why they do NOT
 * call it — `MedicationRemindersScreen` says "deliberately not imported here
 * any more" — and counting those would make this test fail for files that are
 * obeying the rule especially carefully.
 */
function codeLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("//") &&
        !line.startsWith("*") &&
        !line.startsWith("/*")
    );
}

describe("arming has exactly one owner", () => {
  const files = sourceFiles(SOURCE);

  it("finds the modules it is supposed to be checking", () => {
    // Guards against the test passing because the walk returned nothing —
    // the failure mode that makes a source-scanning test worthless.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.endsWith(OWNER))).toBe(true);
  });

  it("⛔ is imported by reminderArming and nowhere else", () => {
    const importers = files.filter((file) => {
      if (file.endsWith(OWNER)) return false;
      if (DEFINITIONS.some((definition) => file.endsWith(definition))) return false;
      return codeLines(readFileSync(file, "utf8")).some(
        (line) => /\bimport\b/.test(line) && /\bscheduleAll\b/.test(line)
      );
    });

    expect(importers.map((file) => file.slice(SOURCE.length + 1))).toEqual([]);
  });

  it("⛔ is called from reminderArming and nowhere else", () => {
    const callers = files.filter((file) => {
      if (file.endsWith(OWNER)) return false;
      if (DEFINITIONS.some((definition) => file.endsWith(definition))) return false;
      return codeLines(readFileSync(file, "utf8")).some((line) =>
        /\bscheduleAll\s*\(/.test(line)
      );
    });

    expect(callers.map((file) => file.slice(SOURCE.length + 1))).toEqual([]);
  });

  it("the owner really does call it, so the rule is not vacuous", () => {
    const owner = files.find((file) => file.endsWith(OWNER)) as string;
    const lines = codeLines(readFileSync(owner, "utf8"));

    expect(lines.some((line) => /\bscheduleAll\s*\(/.test(line))).toBe(true);
  });
});
