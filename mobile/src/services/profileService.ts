/**
 * Care profiles: the people somebody manages records for.
 *
 * The active profile is a device setting, like the refill lead time — which
 * person this phone is currently looking after is not a fact about anyone's
 * health and does not need a server round trip.
 *
 * ⛔ Services take a `profileId` argument; they never read the active profile
 * themselves. Arming reminders has to reach every person's medications at
 * once, and a hidden global would quietly scope it to whoever was selected
 * last. Screens pass the active profile explicitly, where it can be seen.
 *
 * ⛔ `null` always means the account holder. A stored id that no longer
 * matches one of this account's profiles — deleted, or a different account on
 * a shared device — resolves to null rather than being trusted.
 */

import { apiRequest } from "@/services/apiClient";
import { readRaw, removeRaw, writeRaw } from "@/services/deviceStorage";

const ACTIVE_KEY = "medhelp_active_profile";

export interface CareProfile {
  id: string;
  displayName: string;
}

export const SELF_LABEL = "Me";

export async function listProfiles(): Promise<CareProfile[]> {
  const body = (await apiRequest("/profiles", {
    method: "GET",
    fallbackMessage: "We couldn't load the people you manage. Please try again in a moment.",
  })) as { id: string; display_name: string }[] | null;
  return (body ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
}

export async function createProfile(displayName: string): Promise<CareProfile> {
  const row = (await apiRequest("/profiles", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
    fallbackMessage: "We couldn't add that person. Please try again in a moment.",
  })) as { id: string; display_name: string };
  notify();
  return { id: row.id, displayName: row.display_name };
}

export async function deleteProfile(id: string): Promise<void> {
  await apiRequest(`/profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackMessage: "We couldn't remove that person. Please try again in a moment.",
  });
  notify();
}

let listeners: (() => void)[] = [];

/** Called whenever the profiles or the active choice change. */
export function onProfilesChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((each) => each !== listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The active profile as last chosen on this device, id and name, read with no
 * network. ⛔ The emergency card uses this and nothing else: that screen must
 * never make a request, so it cannot ask the server who "Dad" is.
 */
export async function getStoredActiveProfile(): Promise<CareProfile | null> {
  try {
    const raw = await readRaw(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CareProfile;
    return typeof parsed?.id === "string" && typeof parsed.displayName === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function getActiveProfileId(): Promise<string | null> {
  return (await getStoredActiveProfile())?.id ?? null;
}

export async function setActiveProfile(profile: CareProfile | null): Promise<void> {
  try {
    if (profile) {
      await writeRaw(
        ACTIVE_KEY,
        JSON.stringify({ id: profile.id, displayName: profile.displayName })
      );
    } else {
      await removeRaw(ACTIVE_KEY);
    }
  } catch {
    // A setting that cannot be saved falls back to "Me" next launch.
  }
  notify();
}

/** The stored choice, checked against this account's actual profiles. */
export function resolveActive(
  storedId: string | null,
  profiles: CareProfile[]
): CareProfile | null {
  return profiles.find((profile) => profile.id === storedId) ?? null;
}

/** "?profile_id=…" for a list or create call, or "" for the account holder. */
export function profileQuery(profileId: string | null | undefined, joiner: "?" | "&" = "?"): string {
  return profileId ? `${joiner}profile_id=${encodeURIComponent(profileId)}` : "";
}
