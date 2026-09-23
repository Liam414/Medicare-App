import { useCallback, useEffect, useState } from "react";

import { readRaw, writeRaw } from "@/services/deviceStorage";
import { SPANISH_UI_ENABLED, translate, type Language, type StringKey } from "@/i18n/strings";

const KEY = "medhelp_language";

let current: Language = "en";
let listeners: ((language: Language) => void)[] = [];
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await readRaw(KEY);
    if (stored === "es" || stored === "en") setShared(stored);
  } catch {
    // English.
  }
}

function setShared(language: Language): void {
  current = language;
  for (const listener of listeners) listener(language);
}

export async function setLanguage(language: Language): Promise<void> {
  setShared(language);
  try {
    await writeRaw(KEY, language);
  } catch {
    // A device that cannot store it asks again next launch.
  }
}

/**
 * The interface language, a device setting like the refill lead time.
 * Always English while `SPANISH_UI_ENABLED` is false — see `strings.ts`.
 */
export function useLanguage() {
  const [language, setState] = useState<Language>(current);

  useEffect(() => {
    listeners.push(setState);
    void load();
    return () => {
      listeners = listeners.filter((each) => each !== setState);
    };
  }, []);

  const t = useCallback((key: StringKey) => translate(key, language), [language]);

  return { language: SPANISH_UI_ENABLED ? language : ("en" as Language), setLanguage, t };
}
