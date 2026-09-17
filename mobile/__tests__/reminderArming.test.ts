/**
 * Tests for `reminderArming.ts` — the one place that arms notifications.
 *
 * The bug this module exists for: reminders that were saved, listed correctly
 * on screen, and never delivered. Arming lived in `MedicationRemindersScreen`'s
 * focus effect, so a person who set their times and then opened the app on any
 * other tab had nothing armed at all. On the web that is total, because the
 * timers are `setTimeout` handles a reload throws away.
 *
 * Two properties matter here and both are asserted below:
 *
 * 1. **Arming always sends the complete set.** CLAUDE.md's single-caller rule
 *    exists because `cancelAll()` cannot tell a dose reminder from a refill
 *    alert, so anything arming a *subset* would cancel the rest. More callers
 *    are safe; a partial arm is not.
 * 2. **Runs are serialised.** Two overlapping runs would interleave one's
 *    `cancelAll` with the other's scheduling, which is exactly the "silently
 *    stopped firing" failure the rule was written to prevent — and app start
 *    and screen focus really do overlap when the app opens on Medications.
 *
 * All medication names below are invented.
 */

/*
 * ⛔ The `jest.fn()`s are created INSIDE the factories, not above them.
 *
 * `jest.mock` is hoisted above the imports, and the imports are evaluated
 * before any `const` in this file — so a factory that closes over a
 * module-scope `const` reads it in the temporal dead zone and the whole suite
 * fails to run. Creating them in the factory and picking the references up
 * afterwards is the pattern that survives the hoisting.
 */
jest.mock("@/services/notificationService", () => ({
  scheduleAll: jest.fn(async () => {}),
}));
jest.mock("@/services/appSettings", () => ({
  getRefillLeadDays: jest.fn(async () => 3),
}));
jest.mock("@/services/medicationService", () => ({
  listMedications: jest.fn(async () => []),
}));
jest.mock("@/services/reminderService", () => ({
  listSchedules: jest.fn(async () => []),
  toDueReminders: (schedules: { medicationName: string; reminders: unknown[] }[]) =>
    schedules.flatMap((each) =>
      each.reminders.map((reminder) => ({
        ...(reminder as object),
        name: each.medicationName,
      }))
    ),
}));
jest.mock("@/services/refillAlerts", () => ({
  toRefillAlerts: (medications: { id: string }[]) =>
    medications.map((medication) => ({ medicationId: medication.id })),
}));

import { getRefillLeadDays } from "@/services/appSettings";
import { listMedications } from "@/services/medicationService";
import { scheduleAll } from "@/services/notificationService";
import { listSchedules } from "@/services/reminderService";
import { rearm, rearmFrom } from "@/services/reminderArming";

const mockScheduleAll = scheduleAll as jest.Mock;
const mockListSchedules = listSchedules as jest.Mock;
const mockListMedications = listMedications as jest.Mock;
const mockGetRefillLeadDays = getRefillLeadDays as jest.Mock;

function schedule(name: string, times: string[]) {
  return {
    medicationId: `med-${name}`,
    medicationName: name,
    reminders: times.map((timeOfDay) => ({ id: `${name}-${timeOfDay}`, timeOfDay, enabled: true })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListSchedules.mockResolvedValue([]);
  mockListMedications.mockResolvedValue([]);
  mockGetRefillLeadDays.mockResolvedValue(3);
});

describe("rearm", () => {
  it("arms every saved reminder without being asked for a screen", async () => {
    mockListSchedules.mockResolvedValue([
      schedule("Placebofen", ["08:00", "20:00"]),
      schedule("Inertia", ["09:30"]),
    ]);
    mockListMedications.mockResolvedValue([{ id: "med-1" }]);

    const state = await rearm();

    expect(mockScheduleAll).toHaveBeenCalledTimes(1);
    const [reminders, options] = mockScheduleAll.mock.calls[0] as [unknown[], { refillAlerts: unknown[] }];
    // The complete set, in one call — never a subset.
    expect(reminders).toHaveLength(3);
    expect(options.refillAlerts).toHaveLength(1);
    expect(state?.schedules).toHaveLength(2);
  });

  it("returns null and arms nothing when the API cannot be reached", async () => {
    mockListSchedules.mockRejectedValue(new Error("offline"));

    expect(await rearm()).toBeNull();
    // ⛔ Nothing was cancelled either: `mockScheduleAll` was never reached, so
    // whatever the OS already holds survives an app start with no network.
    expect(mockScheduleAll).not.toHaveBeenCalled();
  });

  it("keeps dose reminders when only the medication list fails", async () => {
    mockListSchedules.mockResolvedValue([schedule("Placebofen", ["08:00"])]);
    mockListMedications.mockRejectedValue(new Error("down"));

    const state = await rearm();

    expect(mockScheduleAll).toHaveBeenCalledTimes(1);
    const [reminders, options] = mockScheduleAll.mock.calls[0] as [unknown[], { refillAlerts: unknown[] }];
    expect(reminders).toHaveLength(1);
    // Refill alerts are the extra on top; losing them must not cost the
    // person their dose reminders.
    expect(options.refillAlerts).toEqual([]);
    expect(state).not.toBeNull();
  });

  it("serialises overlapping runs rather than interleaving them", async () => {
    mockListSchedules.mockResolvedValue([schedule("Placebofen", ["08:00"])]);

    const order: string[] = [];
    mockScheduleAll.mockImplementation(async () => {
      order.push("start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("end");
    });

    // App start and a focus effect firing at once.
    await Promise.all([rearm(), rearm()]);

    // Never start, start, end, end — one run completes before the next begins,
    // so no cancel can land in the middle of another's scheduling.
    expect(order).toEqual(["start", "end", "start", "end"]);
  });

  it("does not poison the queue after a failure", async () => {
    mockListSchedules.mockRejectedValueOnce(new Error("offline"));
    expect(await rearm()).toBeNull();

    mockListSchedules.mockResolvedValue([schedule("Placebofen", ["08:00"])]);
    expect(await rearm()).not.toBeNull();
    expect(mockScheduleAll).toHaveBeenCalledTimes(1);
  });
});

describe("rearmFrom", () => {
  it("arms from a set the caller already loaded, without fetching again", async () => {
    await rearmFrom({
      schedules: [schedule("Placebofen", ["08:00", "20:00"])] as never,
      refillAlerts: [{ medicationId: "med-1" }] as never,
      leadDays: 3,
    });

    expect(mockListSchedules).not.toHaveBeenCalled();
    expect(mockListMedications).not.toHaveBeenCalled();
    const [reminders, options] = mockScheduleAll.mock.calls[0] as [unknown[], { refillAlerts: unknown[] }];
    expect(reminders).toHaveLength(2);
    expect(options.refillAlerts).toHaveLength(1);
  });
});
