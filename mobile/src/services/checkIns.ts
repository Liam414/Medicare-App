/**
 * A check-in: "how is it now?", a day after an estimate.
 *
 * Asking again later is ordinary safety-netting — "come back if it is not
 * better". MedHelp used to end at the answer. This keeps one pending check-in
 * on the device and reminds the person when it is due; answering it is just
 * describing things again, with what they said last time already in the box.
 *
 * ⛔ WHAT THIS IS NOT
 *
 * - Not a triage input. The earlier tier is shown to the person as a fact and
 *   never sent anywhere or used to compute anything. The new description goes
 *   through intake exactly like any other.
 * - Not a record of whether anyone got better. Nothing here scores, compares,
 *   or reports on the two answers.
 * - Not offered on EMERGENT. The only useful thing there is how to get help
 *   now, and "we'll ask you tomorrow" would undercut it.
 *
 * ⛔ STORED ON THE DEVICE ONLY, and the notification says nothing clinical.
 * The description is kept so the check-in can be prefilled; it never reaches
 * the server from here. On native it sits in the keystore beside the
 * emergency card; in a browser it is `localStorage`, the same trade the card
 * already makes and states. The notification body is generic because it
 * shows on a lock screen.
 */

import { readRaw, removeRaw, writeRaw } from "@/services/deviceStorage";
import type { Tier } from "@/services/intakeService";

const KEY = "medhelp.checkIn.v1";

/** Past this length the description is not kept (Android keystore values
 * top out near 2 KB). The check-in still happens; the box just starts empty
 * rather than holding a silently shortened version of their words. */
export const MAX_STORED_DESCRIPTION = 1500;

export const CHECK_IN_AFTER_HOURS = 24;

export const CHECK_IN_TITLE = "MedHelp check-in";
export const CHECK_IN_BODY = "You asked MedHelp to check in. How are you feeling now?";

export interface CheckIn {
  dueAt: string;
  createdAt: string;
  earlierTier: Exclude<Tier, "EMERGENT">;
  description: string | null;
  /** Whose check-in it is, so answering it files under the right person. */
  profileId?: string | null;
  profileName?: string | null;
}

/** The one-off notification for a check-in, in the shape the scheduler takes. */
export interface CheckInAlert {
  fireAt: Date;
  title: string;
  body: string;
}

export async function getCheckIn(): Promise<CheckIn | null> {
  const raw = await readRaw(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CheckIn;
    return typeof parsed?.dueAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Replaces any earlier check-in: one at a time keeps "which one?" out of it. */
export async function setCheckIn(
  description: string,
  earlierTier: Exclude<Tier, "EMERGENT">,
  now: Date = new Date(),
  profile: { id: string; displayName: string } | null = null
): Promise<CheckIn> {
  const checkIn: CheckIn = {
    profileId: profile?.id ?? null,
    profileName: profile?.displayName ?? null,
    dueAt: new Date(now.getTime() + CHECK_IN_AFTER_HOURS * 3_600_000).toISOString(),
    createdAt: now.toISOString(),
    earlierTier,
    description:
      description.trim() && description.length <= MAX_STORED_DESCRIPTION ? description : null,
  };
  await writeRaw(KEY, JSON.stringify(checkIn));
  return checkIn;
}

export async function clearCheckIn(): Promise<void> {
  await removeRaw(KEY);
}

export function isDue(checkIn: CheckIn, now: Date = new Date()): boolean {
  return new Date(checkIn.dueAt).getTime() <= now.getTime();
}

/** Nothing to schedule once the moment has passed — Today shows it instead. */
export function toCheckInAlerts(checkIn: CheckIn | null, now: Date = new Date()): CheckInAlert[] {
  if (!checkIn || isDue(checkIn, now)) return [];
  return [{ fireAt: new Date(checkIn.dueAt), title: CHECK_IN_TITLE, body: CHECK_IN_BODY }];
}
