/**
 * The health profile (conditions and allergies, in the person's own words),
 * and the two account-wide data rights: export everything, delete everything.
 *
 * ⛔ An empty list means "nothing recorded", never "none". Say "Not recorded"
 * on every surface — a blank allergy line reads as "no allergies".
 */

import { Platform } from "react-native";

import { apiRequest } from "@/services/apiClient";

export interface HealthProfile {
  conditions: string[];
  allergies: string[];
}

const query = (profileId: string | null) =>
  profileId ? `?profile_id=${encodeURIComponent(profileId)}` : "";

export async function getHealthProfile(profileId: string | null): Promise<HealthProfile> {
  const body = (await apiRequest(`/health-profile${query(profileId)}`, {
    method: "GET",
    fallbackMessage: "We couldn't load the health profile. Please try again in a moment.",
  })) as HealthProfile;
  return { conditions: body.conditions ?? [], allergies: body.allergies ?? [] };
}

export async function saveHealthProfile(
  profileId: string | null,
  profile: HealthProfile
): Promise<HealthProfile> {
  const body = (await apiRequest(`/health-profile${query(profileId)}`, {
    method: "PUT",
    body: JSON.stringify(profile),
    fallbackMessage: "We couldn't save the health profile. Please try again in a moment.",
  })) as HealthProfile;
  return { conditions: body.conditions ?? [], allergies: body.allergies ?? [] };
}

/** Everything the server holds for this account, as pretty-printed JSON. */
export async function exportAccount(): Promise<string> {
  const body = await apiRequest("/account/export", {
    method: "GET",
    fallbackMessage: "We couldn't prepare your data. Please try again in a moment.",
  });
  return JSON.stringify(body, null, 2);
}

/**
 * Hand the export to the person: a file download in a browser, the share
 * sheet on a phone. Nothing is uploaded anywhere; where it goes next is their
 * choice.
 */
export async function saveExport(
  json: string,
  share: (content: { message: string; title?: string }) => Promise<unknown>
): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `medhelp-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await share({ message: json, title: "My MedHelp data" });
}

export async function deleteAccount(password: string): Promise<void> {
  await apiRequest("/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
    fallbackMessage: "We couldn't delete your account. Please try again in a moment.",
  });
}
