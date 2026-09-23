/**
 * Interface text in more than one language.
 *
 * ## ⛔ Spanish ships switched OFF, and the reason is safety, not polish
 *
 * Red-flag screening (`backend/app/core/emergency.py`) reads English. "dolor de
 * pecho" and "no puedo respirar" match nothing and fall to the URGENT default
 * with no instruction to call anyone. A Spanish interface invites exactly the
 * input the screener cannot read, so switching it on before Spanish red-flag
 * phrases exist would make the app less safe for the people it is meant to
 * serve. Those phrases are a change to a fenced module and are proposed in
 * `docs/proposed-spanish-red-flag-phrases.md`, not applied.
 *
 * `EXPO_PUBLIC_SPANISH_UI=true` at build time is the switch. ⛔ Do not set it
 * until (1) Spanish red-flag screening is approved and in place, and (2) a
 * qualified translator has reviewed everything in `es` below.
 *
 * ## ⛔ What is never translated here
 *
 * Disclaimers and escalation copy — `DisclaimerBanner`, `INTAKE_DISCLAIMER`,
 * `ESCALATION_GUIDANCE`, the emergency guidance itself — are fenced and stay
 * as reviewed. A translation of a safety instruction is a new safety
 * instruction and needs its own review. The Spanish notice says so.
 *
 * Only interface chrome is here: tab names, headings, button labels. Nothing
 * clinical. Every Spanish string was written by a software engineer and has
 * not been reviewed.
 */

const en = {
  "tab.Today": "Today",
  "tab.Symptoms": "Symptoms",
  "tab.Medications": "Medications",
  "tab.Care": "Care",
  "tab.Goals": "Goals",
  "today.greeting": "Hi there",
  "today.heroTitle": "Not feeling well?",
  "today.heroBody":
    "MedHelp estimates how soon you may need care. It never names a condition and never recommends a treatment.",
  "today.heroButton": "Check my symptoms",
  "today.medicationTimes": "Your medication times",
  "today.people": "People you look after",
  "intake.title": "What's going on?",
  "intake.subtitle":
    "Type it in your own words, tap it from a list, or do both. Include when it started and anything that's changed.",
  "intake.submit": "Get an urgency estimate",
  "intake.past": "Past descriptions",
  "language.label": "Language",
  "language.notice": "",
} as const;

export type StringKey = keyof typeof en;

/** ⛔ Unreviewed. See the note at the top of this file. */
const es: Partial<Record<StringKey, string>> = {
  "tab.Today": "Hoy",
  "tab.Symptoms": "Síntomas",
  "tab.Medications": "Medicamentos",
  "tab.Care": "Atención",
  "tab.Goals": "Metas",
  "today.greeting": "Hola",
  "today.heroTitle": "¿No se siente bien?",
  "today.heroBody":
    "MedHelp estima qué tan pronto podría necesitar atención. Nunca nombra una enfermedad y nunca recomienda un tratamiento.",
  "today.heroButton": "Revisar mis síntomas",
  "today.medicationTimes": "Sus horarios de medicamentos",
  "today.people": "Personas que usted cuida",
  "intake.title": "¿Qué le está pasando?",
  "intake.subtitle":
    "Escríbalo con sus propias palabras, elíjalo de una lista, o ambas cosas. Diga cuándo empezó y qué ha cambiado.",
  "intake.submit": "Obtener una estimación de urgencia",
  "intake.past": "Descripciones anteriores",
  "language.label": "Idioma",
  "language.notice":
    "Traducción parcial, sin revisión profesional. Los avisos de seguridad aparecen en inglés.",
};

export type Language = "en" | "es";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export const SPANISH_UI_ENABLED = process.env.EXPO_PUBLIC_SPANISH_UI === "true";

const TABLES: Record<Language, Partial<Record<StringKey, string>>> = { en, es };

/**
 * The string for `key` in `language`, falling back to English. With the
 * switch off the answer is always English, whatever was stored.
 */
export function translate(key: StringKey, language: Language): string {
  return translateWith(key, language, SPANISH_UI_ENABLED);
}

/** `translate` with the switch passed in. `EXPO_PUBLIC_*` is inlined at build
 * time, so this is how a test sees both positions of it. */
export function translateWith(key: StringKey, language: Language, enabled: boolean): string {
  const effective = enabled ? language : "en";
  return TABLES[effective][key] ?? en[key];
}
