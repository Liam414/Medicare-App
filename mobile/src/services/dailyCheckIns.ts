/**
 * "How are you feeling today?" — stored on MedHelp's server (decision 5).
 *
 * Not the same thing as `checkIns.ts`, which is the device-only reminder to
 * look again a day after a symptom estimate. This is the person's own daily
 * answer, kept so they can see it over time.
 *
 * ⛔ Shown back, never interpreted: no score, no streak, no "improving".
 */

import { apiRequest } from "@/services/apiClient";

export type Feeling = "better" | "same" | "worse";

export const FEELING_LABELS: Record<Feeling, string> = {
  better: "Better",
  same: "About the same",
  worse: "Worse",
};

export interface DailyCheckIn {
  id: string;
  day: string;
  feeling: Feeling;
  note: string | null;
  suggestSymptomCheck: boolean;
}

type ApiCheckIn = {
  id: string;
  day: string;
  feeling: Feeling;
  note: string | null;
  suggest_symptom_check: boolean;
};

const fromApi = (row: ApiCheckIn): DailyCheckIn => ({
  id: row.id,
  day: row.day,
  feeling: row.feeling,
  note: row.note,
  suggestSymptomCheck: row.suggest_symptom_check,
});

const query = (profileId: string | null, extra = "") => {
  const params = [profileId ? `profile_id=${encodeURIComponent(profileId)}` : "", extra].filter(Boolean);
  return params.length ? `?${params.join("&")}` : "";
};

export async function listDailyCheckIns(profileId: string | null, days = 30): Promise<DailyCheckIn[]> {
  const body = (await apiRequest(`/check-ins${query(profileId, `days=${days}`)}`, {
    method: "GET",
    fallbackMessage: "We couldn't load your check-ins. Please try again in a moment.",
  })) as ApiCheckIn[] | null;
  return (body ?? []).map(fromApi);
}

export async function recordDailyCheckIn(
  profileId: string | null,
  day: string,
  feeling: Feeling,
  note: string
): Promise<DailyCheckIn> {
  const body = (await apiRequest(`/check-ins${query(profileId)}`, {
    method: "POST",
    body: JSON.stringify({ day, feeling, note: note.trim() || null }),
    fallbackMessage: "We couldn't save your check-in. Please try again in a moment.",
  })) as ApiCheckIn;
  return fromApi(body);
}
