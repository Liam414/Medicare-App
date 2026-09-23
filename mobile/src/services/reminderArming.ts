/**
 * Arming reminders and refill alerts, from the whole saved set, in one place.
 *
 * ## Why this module exists
 *
 * `scheduleAll` replaces everything: `cancelAll()` runs first, and on native it
 * calls `cancelAllScheduledNotificationsAsync`, which cannot tell a dose
 * reminder from a refill alert. CLAUDE.md therefore required exactly one caller,
 * and that caller was `MedicationRemindersScreen`.
 *
 * One caller was the right rule and the wrong place. Notifications were armed
 * only while that screen was focused, so a person who set their times, closed
 * the app and came back to any other tab had nothing armed at all. On iOS and
 * Android the OS keeps yesterday's daily triggers, which hid it; **on the web
 * the timers are `setTimeout` handles in a module array**, so every reload threw
 * them away and only a visit to Medications → Reminders brought them back. That
 * is what playtesting found: reminders that were saved, shown correctly on the
 * screen, and never delivered.
 *
 * ## The rule this keeps
 *
 * ⛔ **Still exactly one arming function, and it always arms the complete set.**
 * The danger CLAUDE.md names is two functions each arming a *subset* and taking
 * turns cancelling each other. `rearm()` never arms a subset: it reads
 * everything that is saved and passes the lot to one `scheduleAll`. More callers
 * are safe; a second arming function is not. ⛔ Do not add one, and do not call
 * `scheduleAll` anywhere but here.
 *
 * Calls are also serialised. Two overlapping runs would interleave a `cancelAll`
 * from one with the scheduling half of the other, which is precisely the
 * "silently stopped firing" failure the single-caller rule was written to
 * prevent — and app start and screen focus really do overlap, because opening
 * the app on the Medications tab does both at once.
 */

import { getRefillLeadDays } from "@/services/appSettings";
import { listMedications } from "@/services/medicationService";
import { scheduleAll } from "@/services/notificationService";
import { toRefillAlerts, type RefillAlert } from "@/services/refillAlerts";
import { getCheckIn, toCheckInAlerts } from "@/services/checkIns";
import { listProfiles } from "@/services/profileService";
import {
  listSchedules,
  toDueReminders,
  type MedicationSchedule,
} from "@/services/reminderService";

/** What one arming run read, so a caller that needs it need not fetch twice. */
export interface ArmedState {
  schedules: MedicationSchedule[];
  refillAlerts: RefillAlert[];
  leadDays: number;
}

/**
 * The tail of the last run. Awaiting it before starting serialises the lot.
 *
 * It is deliberately never rejected — see `rearm`.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Re-arm every notification from what is currently saved.
 *
 * Returns what it read, or `null` when it could not read it. ⛔ A failure here
 * must never surface as an error to the person: an unreachable API on app start
 * is not something they asked for and cannot act on, and the on-screen list is
 * the part that is always correct. `MedicationRemindersScreen` reports its own
 * load failures because that load is one the person actually requested.
 */
export async function rearm(): Promise<ArmedState | null> {
  const run = queue.then(async (): Promise<ArmedState | null> => {
    try {
      const leadDays = await getRefillLeadDays();

      // The medication list is fetched only for its refill estimates, and its
      // failure is swallowed separately: refill alerts are the extra on top,
      // and losing them must not cost the person their dose reminders.
      const [schedules, medications] = await Promise.all([
        listSchedules(),
        everyonesMedications(leadDays),
      ]);

      const refillAlerts = toRefillAlerts(medications, leadDays);
      await scheduleAll(toDueReminders(schedules), {
        refillAlerts,
        checkIns: await checkInAlerts(),
      });
      return { schedules, refillAlerts, leadDays };
    } catch {
      // Signed out, offline, or the API is down. Whatever was already armed
      // stays armed: `scheduleAll` was never reached, so nothing was cancelled.
      return null;
    }
  });

  // The queue must never hold a rejected promise, or every later call would
  // reject on awaiting it. `run` already swallows its own failures; this is the
  // belt-and-braces for anything thrown outside the try.
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Every person's medications, for their refill estimates.
 *
 * ⛔ Not just the active profile's. Arming is the whole set for everyone this
 * device looks after — a refill alert for Dad's tablets must not depend on
 * whose list happened to be open last. The medication list endpoint is scoped
 * per person, so this asks once for the account holder and once per profile
 * (at most ten). Any one failing costs that person's refill alerts only.
 */
async function everyonesMedications(leadDays: number) {
  const profiles = await listProfiles().catch(() => []);
  const lists = await Promise.all(
    [null, ...profiles].map(async (profile) => {
      const medications = await listMedications(leadDays, profile?.id).catch(() => []);
      // Only the notification text uses these names, so whose medicine it is
      // goes into the name here, as it does for dose reminders.
      return profile
        ? medications.map((m) => ({ ...m, name: `For ${profile.displayName}: ${m.name}` }))
        : medications;
    })
  );
  return lists.flat();
}

/**
 * The pending check-in, if any. Read from the device every time, because it is
 * part of the whole set and `scheduleAll` cancels everything before arming.
 * An unreadable store costs the check-in notification, never the dose ones.
 */
async function checkInAlerts() {
  try {
    return toCheckInAlerts(await getCheckIn());
  } catch {
    return [];
  }
}

/**
 * Arm from a set the caller has already loaded, without reading it again.
 *
 * `MedicationRemindersScreen` fetches all of this to render, so making it fetch
 * again to arm would double every visit's requests. Same serialisation, same
 * whole-set rule — the complete list still goes to one `scheduleAll`.
 */
export async function rearmFrom(state: ArmedState): Promise<void> {
  const run = queue.then(async () => {
    try {
      await scheduleAll(toDueReminders(state.schedules), {
        refillAlerts: state.refillAlerts,
        checkIns: await checkInAlerts(),
      });
    } catch {
      // As above: arming is best-effort and never the person's problem.
    }
  });
  queue = run.catch(() => undefined);
  return run;
}
