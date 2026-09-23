/**
 * Follow-up reminders and health readings (decisions 5 and 6).
 *
 * ⛔ Nothing here compares a reading with a target or calls one high, low,
 * good or bad. A target is the person's (their clinician's) figure, shown
 * back verbatim. "Due" is date arithmetic on the interval they chose.
 */

import { apiRequest } from "@/services/apiClient";
import type { CheckInAlert } from "@/services/checkIns";

const q = (profileId: string | null) => (profileId ? `?profile_id=${encodeURIComponent(profileId)}` : "");

// --- Follow-ups --------------------------------------------------------------

export type FollowUpKind = "return_visit" | "post_visit_check_in" | "other";

export const FOLLOW_UP_KIND_LABELS: Record<FollowUpKind, string> = {
  return_visit: "Go back to see a clinician",
  post_visit_check_in: "Check in after a visit",
  other: "Something else",
};

export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  title: string;
  dueOn: string;
  doneOn: string | null;
}

type ApiFollowUp = { id: string; kind: FollowUpKind; title: string; due_on: string; done_on: string | null };
const followUpFromApi = (r: ApiFollowUp): FollowUp => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  dueOn: r.due_on,
  doneOn: r.done_on,
});

export async function listFollowUps(profileId: string | null): Promise<FollowUp[]> {
  const body = (await apiRequest(`/follow-ups${q(profileId)}`, {
    method: "GET",
    fallbackMessage: "We couldn't load your follow-ups. Please try again in a moment.",
  })) as ApiFollowUp[] | null;
  return (body ?? []).map(followUpFromApi);
}

export async function createFollowUp(
  profileId: string | null,
  input: { kind: FollowUpKind; title: string; dueOn: string }
): Promise<FollowUp> {
  const body = await apiRequest(`/follow-ups${q(profileId)}`, {
    method: "POST",
    body: JSON.stringify({ kind: input.kind, title: input.title, due_on: input.dueOn }),
    fallbackMessage: "We couldn't save that follow-up. Please try again in a moment.",
  });
  return followUpFromApi(body as ApiFollowUp);
}

export async function setFollowUpDone(id: string, done: boolean): Promise<FollowUp> {
  const body = await apiRequest(`/follow-ups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
    fallbackMessage: "We couldn't update that follow-up. Please try again in a moment.",
  });
  return followUpFromApi(body as ApiFollowUp);
}

export async function deleteFollowUp(id: string): Promise<void> {
  await apiRequest(`/follow-ups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackMessage: "We couldn't remove that follow-up. Please try again in a moment.",
  });
}

export const FOLLOW_UP_ALERT_TITLE = "MedHelp follow-up";
// ⛔ Generic on purpose: this shows on a lock screen.
export const FOLLOW_UP_ALERT_BODY = "You have a follow-up due today. Open MedHelp to see it.";

/** A one-off 09:00 local alert on each open follow-up's due day, future only. */
export function toFollowUpAlerts(followUps: FollowUp[], now: Date = new Date()): CheckInAlert[] {
  return followUps
    .filter((f) => f.doneOn === null)
    .map((f) => {
      // Local midnight + 9h, never `new Date("YYYY-MM-DD")`, which is UTC.
      const [y, m, d] = f.dueOn.split("-").map(Number);
      return new Date(y, m - 1, d, 9, 0, 0);
    })
    .filter((fireAt) => fireAt.getTime() > now.getTime())
    .map((fireAt) => ({ fireAt, title: FOLLOW_UP_ALERT_TITLE, body: FOLLOW_UP_ALERT_BODY }));
}

// --- Readings ----------------------------------------------------------------

export type ReadingKind = "blood_pressure" | "weight" | "blood_glucose" | "steps";

export const READING_KINDS: ReadingKind[] = ["blood_pressure", "weight", "blood_glucose", "steps"];

export const READING_LABELS: Record<ReadingKind, string> = {
  blood_pressure: "Blood pressure",
  weight: "Weight",
  blood_glucose: "Blood sugar",
  steps: "Steps",
};

export const READING_UNITS: Record<Exclude<ReadingKind, "blood_pressure">, string[]> = {
  weight: ["kg", "lb"],
  blood_glucose: ["mg/dL", "mmol/L"],
  steps: ["steps"],
};

export interface Reading {
  id: string;
  kind: ReadingKind;
  takenOn: string;
  value: { systolic?: number; diastolic?: number; value?: number; unit: string };
}

export interface ReadingSummary {
  kind: ReadingKind;
  targetText: string | null;
  remindEveryDays: number | null;
  lastTakenOn: string | null;
  due: boolean;
  daysSince: number | null;
}

type ApiSummary = {
  kind: ReadingKind;
  target_text: string | null;
  remind_every_days: number | null;
  last_taken_on: string | null;
  due: boolean;
  days_since: number | null;
};

const summaryFromApi = (s: ApiSummary): ReadingSummary => ({
  kind: s.kind,
  targetText: s.target_text,
  remindEveryDays: s.remind_every_days,
  lastTakenOn: s.last_taken_on,
  due: s.due,
  daysSince: s.days_since,
});

export async function listReadings(
  profileId: string | null
): Promise<{ summaries: ReadingSummary[]; readings: Reading[] }> {
  const body = (await apiRequest(`/readings${q(profileId)}`, {
    method: "GET",
    fallbackMessage: "We couldn't load your readings. Please try again in a moment.",
  })) as { summaries: ApiSummary[]; readings: (Omit<Reading, "takenOn"> & { taken_on: string })[] };
  return {
    summaries: body.summaries.map(summaryFromApi),
    readings: body.readings.map((r) => ({ id: r.id, kind: r.kind, takenOn: r.taken_on, value: r.value })),
  };
}

export async function logReading(
  profileId: string | null,
  input:
    | { kind: "blood_pressure"; takenOn: string; systolic: number; diastolic: number }
    | { kind: Exclude<ReadingKind, "blood_pressure">; takenOn: string; value: number; unit: string }
): Promise<void> {
  const { takenOn, ...rest } = input;
  await apiRequest(`/readings${q(profileId)}`, {
    method: "POST",
    body: JSON.stringify({ ...rest, taken_on: takenOn }),
    fallbackMessage: "We couldn't save that reading. Please try again in a moment.",
  });
}

export async function setTarget(
  profileId: string | null,
  kind: ReadingKind,
  targetText: string,
  remindEveryDays: number | null
): Promise<ReadingSummary[]> {
  const body = (await apiRequest(`/readings/targets/${kind}${q(profileId)}`, {
    method: "PUT",
    body: JSON.stringify({ target_text: targetText.trim() || null, remind_every_days: remindEveryDays }),
    fallbackMessage: "We couldn't save that target. Please try again in a moment.",
  })) as ApiSummary[];
  return body.map(summaryFromApi);
}

/** How a reading reads back: its numbers and unit, nothing added. */
export function formatReading(reading: Reading): string {
  const v = reading.value;
  return reading.kind === "blood_pressure" ? `${v.systolic}/${v.diastolic} ${v.unit}` : `${v.value} ${v.unit}`;
}
