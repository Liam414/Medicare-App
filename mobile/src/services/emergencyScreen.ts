/**
 * The red-flag screen, on the phone, for when the server cannot be reached.
 *
 * ## Why this exists
 *
 * Emergency screening ran only on the server. With no signal — or with the
 * API down — somebody describing chest pain got "Can't reach the MedHelp
 * server" and a generic line, not the reviewed instruction for what they had
 * described. The emergency card already works offline for the same reason:
 * the moment it matters is the moment a request is most likely to fail.
 *
 * ## ⛔ One copy of the rules, and it is not this file
 *
 * The phrases, the exception, the combinations and the copy all come from
 * `src/generated/emergencyRules.json`, exported from
 * `backend/app/core/emergency.py` by `backend/scripts/export_emergency_rules.py`.
 * Nothing here may add a phrase or word a headline. The export also carries
 * parity cases — descriptions run through the real Python screen — and
 * `__tests__/emergencyScreen.test.ts` requires this matcher to agree with
 * every one of them.
 *
 * ## ⛔ A fallback, never a replacement
 *
 * The server's answer always wins when there is one. This runs only when intake
 * could not get one, and it can only ever *add* guidance: a description it
 * does not flag is shown exactly what it was shown before — the offline
 * message that says to call 911 if this may be an emergency.
 *
 * ## Why no regular expressions
 *
 * The Python matcher uses Unicode `\w` and lookbehind. JavaScript's `\w` is
 * ASCII-only, and regex feature support varies across the engines this app
 * ships on. Plain string search with the boundary checked by hand behaves the
 * same everywhere, and the parity cases prove it matches the server.
 */

import rules from "@/generated/emergencyRules.json";

export interface LocalEmergencyGuidance {
  category: string;
  headline: string;
  action: string;
}

interface Rule {
  category: string;
  headline: string;
  action: string;
  phrases: string[];
}

const RULES = rules.rules as Rule[];
const VOIDED = rules.voidedByPrefix as Record<string, string[]>;
const CONCEPTS = rules.concepts as Record<string, string[]>;
const COMBINATIONS = rules.combinations as { category: string; required: string[] }[];

/** Mirrors `emergency.normalize_query`. */
export function normalizeQuery(query: string): string {
  return query
    .replace(/[’‘ʼ]/g, "'")
    .replace(/([a-z])(?=[A-Z])/g, "$1 ")
    .replace(/\s+/g, " ");
}

/** Python's `\w`: a letter or digit in any script, or an underscore. */
function isWordChar(character: string | undefined): boolean {
  if (!character) return false;
  if (character === "_" || (character >= "0" && character <= "9")) return true;
  return character.toLowerCase() !== character.toUpperCase();
}

/** Every start index of `needle` in `haystack` with a word boundary each side. */
function boundedAt(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return found;
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) {
      found.push(at);
    }
    from = at + 1;
  }
}

/** Mirrors `emergency.plural_tolerant`: the phrase and its ordinary plural. */
function variants(phrase: string): string[] {
  const p = phrase.toLowerCase();
  const last = p[p.length - 1];
  const beforeLast = p[p.length - 2];
  if (last === "y" && p.length > 1 && !"aeiou".includes(beforeLast)) {
    return [p, `${p.slice(0, -1)}ies`];
  }
  return [p, `${p}s`, `${p}es`];
}

function phraseMatches(text: string, phrase: string): boolean {
  const voidedBy = (VOIDED[phrase] ?? []).map((prefix) => `${prefix.toLowerCase()} `);
  return variants(phrase).some((variant) =>
    boundedAt(text, variant).some(
      (at) => !voidedBy.some((prefix) => text.slice(at - prefix.length, at) === prefix)
    )
  );
}

function guidanceFor(category: string): LocalEmergencyGuidance {
  const rule = RULES.find((each) => each.category === category)!;
  return { category, headline: rule.headline, action: rule.action };
}

/**
 * Guidance if `query` contains red-flag language, exactly as the server would
 * return it, or null. Same order as the server: literal phrases, then the
 * concept combinations.
 */
export function screenLocally(query: string): LocalEmergencyGuidance | null {
  if (!query || !query.trim()) return null;
  const text = normalizeQuery(query).toLowerCase();

  for (const rule of RULES) {
    if (rule.phrases.some((phrase) => phraseMatches(text, phrase))) {
      return guidanceFor(rule.category);
    }
  }

  // Concept phrases carry no plural tolerance, matching `symptom_concepts`.
  const named = new Set(
    Object.entries(CONCEPTS)
      .filter(([, phrases]) => phrases.some((p) => boundedAt(text, p.toLowerCase()).length > 0))
      .map(([concept]) => concept)
  );
  for (const combination of COMBINATIONS) {
    if (combination.required.every((concept) => named.has(concept))) {
      return guidanceFor(combination.category);
    }
  }
  return null;
}
