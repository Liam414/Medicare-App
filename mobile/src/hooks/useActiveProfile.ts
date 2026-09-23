import { useCallback, useEffect, useState } from "react";

import {
  getActiveProfileId,
  listProfiles,
  onProfilesChange,
  resolveActive,
  type CareProfile,
} from "@/services/profileService";

/**
 * Whose records this screen is showing.
 *
 * Read on mount and again whenever a profile is added, removed or chosen —
 * `profileService` announces each — so a screen underneath the profile picker
 * is already right when the person comes back to it. No navigation hook, so
 * any screen can use it without its tests standing up a navigator.
 *
 * `ready` is false until the answer is known. A screen that loads records
 * must wait for it: loading "mine" and then swapping to "Dad's" would flash
 * one person's medications under another person's name.
 *
 * A failed profile list resolves to the account holder, never to a guess —
 * the screens say "Me" and show "Me"'s records, which is at least consistent.
 */
export function useActiveProfile() {
  const [profiles, setProfiles] = useState<CareProfile[]>([]);
  const [active, setActive] = useState<CareProfile | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [stored, list] = await Promise.all([
      getActiveProfileId(),
      listProfiles().catch(() => [] as CareProfile[]),
    ]);
    setProfiles(list);
    setActive(resolveActive(stored, list));
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    return onProfilesChange(() => void refresh());
  }, [refresh]);

  return { active, profiles, ready, profileId: active?.id ?? null, refresh };
}
