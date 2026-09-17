/**
 * A closed list of lay symptom phrases, and a deterministic way to match text
 * against it.
 *
 * ⛔ READ THIS BEFORE CHANGING ANYTHING IN THIS FILE.
 *
 * This is app-authored clinical vocabulary. CLAUDE.md otherwise forbids that —
 * "offering a menu of conditions would make MedHelp the author of a clinical
 * vocabulary" is the stated reason the emergency card has no picker, and the
 * same reasoning applies here. It exists because the repository owner asked
 * for it directly and approved it on 2026-09-16, having been told that is what
 * it makes the app. That approval is recorded in CLAUDE.md; this comment is
 * the pointer to it, not the authorisation for it.
 *
 * It has NOT been reviewed by a clinician. Every phrase here was written by a
 * software engineer, the same standing as the phrase lists in
 * `rules_triage.py` and `dose_schedule.py`, and it belongs in the same review.
 *
 * ── The four rules this list is built on ──────────────────────────────────
 *
 * 1. SYMPTOMS ONLY, NEVER CONDITIONS. "chest tightness" is a thing a person
 *    feels; "angina" is a diagnosis. The app must never diagnose, and a menu
 *    naming conditions would do exactly that — the user would pick the one
 *    they think they have. There is no entry here that names a disease.
 *
 * 2. NO SEVERITY IS ATTACHED TO ANY ENTRY, and none may be added. A symptom
 *    shown as "mild" or "self-care" is app-authored reassurance, and it would
 *    invert the one-directional safety property the triage design rests on
 *    (neither layer may LOWER a tier). Urgency is decided once, downstream, by
 *    the classifier reading the whole description — never here, and never per
 *    symptom. `test_no_entry_carries_a_severity` asserts the shape.
 *
 * 3. RELATEDNESS IS ANATOMICAL, NEVER CLINICAL. `area` groups phrases by the
 *    part of the body a person would say they are about. It does NOT say
 *    which symptoms occur together, which would be a clinical association and
 *    the thing this app may not assert. Suggesting "pain spreading to my arm"
 *    to someone who typed "chest pain" would be prompting for a cardiac red
 *    flag — a screening question wearing the clothes of an autocomplete. The
 *    UI says "other things people describe about the chest" for this reason,
 *    and must keep saying something like it.
 *
 * 4. THE LIST IS NEVER RANKED BY SERIOUSNESS. Matches come back in the order
 *    they appear here, which is alphabetical within an area. Ordering symptoms
 *    by how alarming they are would be the clinical judgement rule 2 forbids,
 *    and it is the same rule that stops the app reordering MedlinePlus topics
 *    or ranking providers.
 *
 * ── How it runs ───────────────────────────────────────────────────────────
 *
 * On the device, always. No endpoint, no network call, no model. A typed
 * partial symptom is health text, and a GET with it in the query string would
 * put it in access logs — CLAUDE.md requires intake text to reach the backend
 * by POST "never as a URL query string". Matching here means it does not reach
 * the backend at all until the user submits, so there is no new transmission
 * and no new BAA question, the same reasoning that put label OCR on-device.
 * `symptomVocabulary.test.ts` asserts `fetch` is never called.
 *
 * Matching is substring, case- and punctuation-insensitive, and deterministic
 * — the same text always produces the same list, for the same reason the rule
 * layer is a phrase list rather than a classifier: a reviewer can read it.
 */

export interface Symptom {
  /** Stable id. Never shown. */
  id: string;
  /** The lay phrase, exactly as it is rendered and exactly as it is inserted. */
  label: string;
  /**
   * Alternative wordings, used ONLY to decide whether a phrase matches what
   * was typed. Never rendered — the same rule as MedlinePlus `altTitle`
   * synonyms, which are match input and are not shown.
   */
  synonyms: string[];
  /**
   * Lay body area. Anatomical grouping only — see rule 3 above. This is not a
   * clinical category and nothing may treat it as one.
   */
  area: Area;
}

export type Area =
  | "head"
  | "eyes"
  | "ear-nose-throat"
  | "chest"
  | "breathing"
  | "stomach"
  | "urinary"
  | "back-and-limbs"
  | "skin"
  | "whole-body"
  | "mood"
  | "nerves-and-senses";

/** How each area is named to the user. Plain words, no clinical register. */
export const AREA_LABELS: Record<Area, string> = {
  head: "head",
  eyes: "eyes",
  "ear-nose-throat": "ears, nose and throat",
  chest: "chest",
  breathing: "breathing",
  stomach: "stomach and digestion",
  urinary: "waterworks",
  "back-and-limbs": "back, arms and legs",
  skin: "skin",
  "whole-body": "how you feel overall",
  mood: "mood and thinking",
  "nerves-and-senses": "movement and senses",
};

/*
  The list itself.

  Alphabetical within each area, because it must not be ordered by seriousness
  (rule 4). Phrasing is how a person actually writes — "my head is pounding",
  not "cephalalgia" — the same convention the rule layer uses, and for the same
  reason: these are matched against what someone typed.
*/
export const SYMPTOMS: readonly Symptom[] = [
  // ── head ──
  { id: "headache", label: "a headache", synonyms: ["head hurts", "head pain", "sore head"], area: "head" },
  { id: "head-pounding", label: "a pounding or throbbing head", synonyms: ["pounding head", "throbbing head", "head is pounding"], area: "head" },
  { id: "head-pressure", label: "pressure in my head", synonyms: ["head feels full", "tight head"], area: "head" },
  { id: "worst-headache", label: "the worst headache I have ever had", synonyms: ["worst headache", "sudden severe headache", "thunderclap"], area: "head" },

  // ── eyes ──
  { id: "blurred-vision", label: "blurred vision", synonyms: ["blurry vision", "vision is blurry", "can't focus"], area: "eyes" },
  { id: "double-vision", label: "double vision", synonyms: ["seeing double"], area: "eyes" },
  { id: "eye-pain", label: "pain in my eye", synonyms: ["sore eye", "eye hurts"], area: "eyes" },
  { id: "light-hurts", label: "light hurts my eyes", synonyms: ["sensitive to light", "photophobia", "bright light hurts"], area: "eyes" },
  { id: "vision-loss", label: "losing vision", synonyms: ["lost my sight", "can't see", "went blind", "curtain over my eye"], area: "eyes" },

  // ── ears, nose and throat ──
  { id: "earache", label: "an earache", synonyms: ["ear hurts", "sore ear", "ear pain"], area: "ear-nose-throat" },
  { id: "hearing-loss", label: "trouble hearing", synonyms: ["can't hear", "muffled hearing", "hearing has gone"], area: "ear-nose-throat" },
  { id: "runny-nose", label: "a runny or stuffy nose", synonyms: ["blocked nose", "congested", "stuffy nose", "runny nose"], area: "ear-nose-throat" },
  { id: "sore-throat", label: "a sore throat", synonyms: ["throat hurts", "scratchy throat", "painful to swallow"], area: "ear-nose-throat" },
  { id: "swollen-glands", label: "swollen glands in my neck", synonyms: ["swollen glands", "lumps in my neck", "swollen neck"], area: "ear-nose-throat" },
  { id: "throat-closing", label: "my throat feels like it is closing", synonyms: ["throat closing", "throat tightening", "can't swallow"], area: "ear-nose-throat" },
  { id: "voice-hoarse", label: "a hoarse voice", synonyms: ["lost my voice", "croaky", "hoarse"], area: "ear-nose-throat" },

  // ── chest ──
  { id: "chest-pain", label: "chest pain", synonyms: ["pain in my chest", "my chest hurts", "sore chest"], area: "chest" },
  { id: "chest-pressure", label: "pressure or tightness in my chest", synonyms: ["chest tightness", "chest feels tight", "crushing chest", "weight on my chest", "pressure in my chest"], area: "chest" },
  { id: "heart-racing", label: "my heart is racing or skipping", synonyms: ["palpitations", "heart pounding", "racing heart", "fluttering"], area: "chest" },
  { id: "pain-to-arm", label: "pain spreading to my arm, neck or jaw", synonyms: ["pain in my arm", "pain in my jaw", "radiating pain"], area: "chest" },

  // ── breathing ──
  { id: "breathless", label: "shortness of breath", synonyms: ["short of breath", "breathless", "can't catch my breath", "hard to breathe", "trouble breathing"], area: "breathing" },
  { id: "cough-dry", label: "a dry cough", synonyms: ["tickly cough", "hacking cough"], area: "breathing" },
  { id: "cough-phlegm", label: "a cough bringing up phlegm", synonyms: ["chesty cough", "productive cough", "coughing up mucus"], area: "breathing" },
  { id: "coughing-blood", label: "coughing up blood", synonyms: ["blood when I cough", "bloody phlegm"], area: "breathing" },
  { id: "wheezing", label: "wheezing", synonyms: ["whistling when I breathe", "wheezy"], area: "breathing" },

  // ── stomach and digestion ──
  { id: "abdominal-pain", label: "stomach pain", synonyms: ["belly pain", "tummy hurts", "pain in my abdomen", "stomach ache", "cramping"], area: "stomach" },
  { id: "appetite-loss", label: "no appetite", synonyms: ["not eating", "can't eat", "lost my appetite"], area: "stomach" },
  { id: "bloating", label: "bloating", synonyms: ["bloated", "swollen belly"], area: "stomach" },
  { id: "blood-in-stool", label: "blood when I go to the toilet", synonyms: ["blood in my stool", "bleeding from my bottom", "black stools"], area: "stomach" },
  { id: "constipation", label: "constipation", synonyms: ["can't go", "haven't been"], area: "stomach" },
  { id: "diarrhoea", label: "diarrhoea", synonyms: ["loose stools", "runny stools", "diarrhea", "the runs"], area: "stomach" },
  { id: "heartburn", label: "heartburn or reflux", synonyms: ["burning in my chest after eating", "acid reflux", "indigestion"], area: "stomach" },
  { id: "nausea", label: "feeling sick", synonyms: ["nauseous", "nausea", "queasy", "feel like throwing up"], area: "stomach" },
  { id: "vomiting", label: "vomiting", synonyms: ["throwing up", "being sick", "can't keep anything down"], area: "stomach" },
  { id: "vomiting-blood", label: "vomiting blood", synonyms: ["blood when I am sick", "coffee grounds"], area: "stomach" },

  // ── waterworks ──
  { id: "blood-in-urine", label: "blood in my urine", synonyms: ["blood when I pee", "pink urine", "red urine"], area: "urinary" },
  { id: "painful-urination", label: "pain or burning when I pee", synonyms: ["burning when I pee", "stinging when I urinate", "painful urination"], area: "urinary" },
  { id: "urinating-often", label: "needing to pee much more often", synonyms: ["peeing a lot", "going all the time", "frequent urination"], area: "urinary" },
  { id: "cant-urinate", label: "not able to pee", synonyms: ["can't pee", "can't pass urine", "nothing comes out"], area: "urinary" },

  // ── back, arms and legs ──
  { id: "back-pain", label: "back pain", synonyms: ["my back hurts", "sore back", "aching back"], area: "back-and-limbs" },
  { id: "joint-pain", label: "painful joints", synonyms: ["joint pain", "sore joints", "aching joints"], area: "back-and-limbs" },
  { id: "joint-swelling", label: "a swollen joint", synonyms: ["swollen knee", "swollen ankle", "puffy joint"], area: "back-and-limbs" },
  { id: "leg-swelling", label: "swelling in my leg", synonyms: ["swollen leg", "swollen calf", "puffy ankles"], area: "back-and-limbs" },
  { id: "muscle-aches", label: "aching muscles", synonyms: ["muscle aches", "body aches", "everything aches"], area: "back-and-limbs" },
  { id: "neck-stiff", label: "a stiff neck", synonyms: ["neck is stiff", "can't move my neck", "stiff neck"], area: "back-and-limbs" },

  // ── skin ──
  { id: "bruising", label: "bruising easily", synonyms: ["bruises", "bruising"], area: "skin" },
  { id: "itching", label: "itching", synonyms: ["itchy", "scratching"], area: "skin" },
  { id: "rash", label: "a rash", synonyms: ["spots", "blotches", "red patches"], area: "skin" },
  { id: "rash-no-fade", label: "a rash that does not fade when pressed", synonyms: ["rash that doesn't fade", "glass test"], area: "skin" },
  { id: "swelling-face", label: "swelling of my face, lips or tongue", synonyms: ["swollen lips", "swollen tongue", "face is swelling"], area: "skin" },
  { id: "wound-not-healing", label: "a cut or sore that will not heal", synonyms: ["wound won't heal", "sore that won't heal"], area: "skin" },

  // ── how you feel overall ──
  { id: "chills", label: "chills or shivering", synonyms: ["shivering", "shivers", "cold sweats"], area: "whole-body" },
  { id: "dizzy", label: "feeling dizzy or lightheaded", synonyms: ["dizzy", "lightheaded", "room is spinning", "woozy"], area: "whole-body" },
  { id: "fainted", label: "fainting or passing out", synonyms: ["passed out", "blacked out", "fainted", "collapsed"], area: "whole-body" },
  { id: "fever", label: "a fever", synonyms: ["temperature", "burning up", "feverish", "hot"], area: "whole-body" },
  { id: "night-sweats", label: "night sweats", synonyms: ["sweating at night", "drenched at night"], area: "whole-body" },
  { id: "tired", label: "feeling very tired", synonyms: ["exhausted", "fatigue", "no energy", "worn out", "extremely tired"], area: "whole-body" },
  { id: "weight-loss", label: "losing weight without trying", synonyms: ["unexplained weight loss", "losing weight"], area: "whole-body" },

  // ── mood and thinking ──
  { id: "anxious", label: "feeling anxious or panicky", synonyms: ["anxiety", "panicking", "on edge", "panic"], area: "mood" },
  { id: "confused", label: "feeling confused or muddled", synonyms: ["confusion", "can't think straight", "disoriented", "muddled"], area: "mood" },
  { id: "low-mood", label: "feeling very low", synonyms: ["depressed", "low mood", "hopeless", "can't cope"], area: "mood" },
  { id: "self-harm", label: "thoughts of harming myself", synonyms: ["hurting myself", "hurt myself", "ending it", "suicidal"], area: "mood" },
  { id: "sleep-trouble", label: "trouble sleeping", synonyms: ["can't sleep", "insomnia", "waking up a lot"], area: "mood" },

  // ── movement and senses ──
  { id: "face-drooping", label: "my face is drooping on one side", synonyms: ["face drooping", "drooping face", "one side of my face"], area: "nerves-and-senses" },
  { id: "numbness", label: "numbness or tingling", synonyms: ["pins and needles", "numb", "tingling"], area: "nerves-and-senses" },
  { id: "seizure", label: "a seizure or fit", synonyms: ["fit", "convulsion", "seizure"], area: "nerves-and-senses" },
  { id: "slurred-speech", label: "slurred or muddled speech", synonyms: ["can't speak properly", "slurring", "words won't come"], area: "nerves-and-senses" },
  { id: "unsteady", label: "feeling unsteady on my feet", synonyms: ["losing my balance", "keep stumbling", "unsteady"], area: "nerves-and-senses" },
  { id: "weakness-one-side", label: "weakness on one side of my body", synonyms: ["weak arm", "weak leg", "one side is weak", "can't lift my arm"], area: "nerves-and-senses" },
];

/** Strip case and punctuation so "Pins-and-needles!" matches "pins and needles". */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The shortest string worth matching on.
 *
 * Below this every symptom matches something and the list is noise. Two
 * characters would offer the whole vocabulary to someone who typed "I".
 */
const MIN_QUERY = 3;

/** How many suggestions to return. Enough to be useful, short enough to read. */
const MAX_SUGGESTIONS = 8;

function haystack(symptom: Symptom): string[] {
  return [symptom.label, ...symptom.synonyms].map(normalise);
}

/**
 * Symptoms whose own name contains something the user wrote.
 *
 * Deliberately the same shape as `names_match` in the MedlinePlus lookup: a
 * phrase is offered only because a name it actually has contains a word that
 * was actually typed. Nothing is offered on a guess about what someone means.
 */
export function matchSymptoms(query: string, exclude: readonly string[] = []): Symptom[] {
  const cleaned = normalise(query);
  if (cleaned.length < MIN_QUERY) return [];

  const skip = new Set(exclude);
  // Longest word first: in "my chest hurts", "chest" is the complaint and "my"
  // is scaffolding. Same reasoning as search_terms.py trying the last word
  // first — English puts the qualifier in front of the thing.
  const words = cleaned.split(" ").filter((word) => word.length >= MIN_QUERY);
  if (words.length === 0) return [];

  const hits: Symptom[] = [];
  for (const symptom of SYMPTOMS) {
    if (skip.has(symptom.id)) continue;
    const names = haystack(symptom);
    const matched = names.some(
      (name) => name.includes(cleaned) || words.some((word) => name.includes(word))
    );
    if (matched) hits.push(symptom);
  }

  return hits.slice(0, MAX_SUGGESTIONS);
}

/**
 * Other phrases about the same part of the body.
 *
 * ⛔ ANATOMICAL, NOT CLINICAL. These are not symptoms that "go with" what the
 * user described — the app does not know that and may not say it. They are
 * other things people say about the same area, offered so somebody does not
 * have to think of every word themselves. The UI must name them that way.
 */
export function relatedByArea(
  selectedIds: readonly string[],
  exclude: readonly string[] = []
): Symptom[] {
  const skip = new Set([...exclude, ...selectedIds]);
  const areas = new Set(
    SYMPTOMS.filter((symptom) => selectedIds.includes(symptom.id)).map((s) => s.area)
  );
  if (areas.size === 0) return [];

  return SYMPTOMS.filter(
    (symptom) => areas.has(symptom.area) && !skip.has(symptom.id)
  ).slice(0, MAX_SUGGESTIONS);
}

/** Look one up by id. Returns undefined for an id this build does not know. */
export function symptomById(id: string): Symptom | undefined {
  return SYMPTOMS.find((symptom) => symptom.id === id);
}

/**
 * The labels for a set of ids, in the order the list defines them.
 *
 * Order is the vocabulary's own, not the order the user tapped, so the same
 * selection always produces the same text — the classifier downstream is
 * deterministic and should be given deterministic input. Unknown ids are
 * dropped rather than guessed at.
 */
export function labelsFor(ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return SYMPTOMS.filter((symptom) => wanted.has(symptom.id)).map((s) => s.label);
}
