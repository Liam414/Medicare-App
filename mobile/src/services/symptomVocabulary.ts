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
  | "mouth-and-teeth"
  | "chest"
  | "breathing"
  | "stomach"
  | "bowels"
  | "urinary"
  | "back-and-limbs"
  | "skin"
  | "whole-body"
  | "mood"
  | "nerves-and-senses"
  | "womens-health"
  | "mens-health"
  | "pregnancy"
  | "children"
  | "injuries"
  | "medicines";

/** How each area is named to the user. Plain words, no clinical register. */
export const AREA_LABELS: Record<Area, string> = {
  head: "head",
  eyes: "eyes",
  "ear-nose-throat": "ears, nose and throat",
  "mouth-and-teeth": "mouth and teeth",
  chest: "chest",
  breathing: "breathing",
  stomach: "stomach and digestion",
  bowels: "bowels",
  urinary: "waterworks",
  "back-and-limbs": "back, arms and legs",
  skin: "skin",
  "whole-body": "how you feel overall",
  mood: "mood and thinking",
  "nerves-and-senses": "movement and senses",
  "womens-health": "periods and women's health",
  "mens-health": "men's health",
  pregnancy: "pregnancy",
  children: "babies and children",
  injuries: "injuries and accidents",
  medicines: "medicines",
};

/**
 * The order areas are offered in when somebody browses rather than types.
 *
 * ⛔ THIS IS NOT A RANKING, AND MUST NEVER BECOME ONE. Rule 4 forbids ordering
 * by seriousness, and an ordered list of body areas is the easiest place to
 * break it by accident — putting "chest" first because chest symptoms are
 * frightening would be exactly the clinical judgement the rule rules out.
 *
 * The order is head downwards, then the whole-person areas, then the ones
 * defined by who you are or what happened rather than by a body part. It is
 * the order a person scanning a list would expect to find things in, and it is
 * the same order whatever anybody has typed or picked.
 */
export const AREAS_IN_BROWSE_ORDER: readonly Area[] = [
  "head",
  "eyes",
  "ear-nose-throat",
  "mouth-and-teeth",
  "chest",
  "breathing",
  "stomach",
  "bowels",
  "urinary",
  "back-and-limbs",
  "skin",
  "nerves-and-senses",
  "whole-body",
  "mood",
  "womens-health",
  "mens-health",
  "pregnancy",
  "children",
  "injuries",
  "medicines",
];

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
  { id: "headache-sudden", label: "a headache that came on suddenly", synonyms: ["sudden headache", "headache out of nowhere"], area: "head" },
  { id: "headache-woke-me", label: "a headache that woke me up", synonyms: ["headache in the night", "woke up with a headache"], area: "head" },
  { id: "headache-bending", label: "a headache that is worse when I bend down", synonyms: ["worse when I bend", "worse leaning forward"], area: "head" },
  { id: "head-pounding", label: "a pounding or throbbing head", synonyms: ["pounding head", "throbbing head", "head is pounding"], area: "head" },
  { id: "head-pressure", label: "pressure in my head", synonyms: ["head feels full", "tight head"], area: "head" },
  { id: "scalp-tender", label: "tenderness in my scalp or temples", synonyms: ["sore scalp", "tender temples", "hurts to brush my hair"], area: "head" },
  // ⛔ "of my life" is the idiom the stroke list holds. "the worst headache I
  // have ever had" means the same thing to a person and nothing to the matcher.
  { id: "worst-headache", label: "the worst headache of my life", synonyms: ["worst headache I have ever had", "sudden severe headache", "thunderclap"], area: "head" },

  // ── eyes ──
  { id: "blurred-vision", label: "blurred vision", synonyms: ["blurry vision", "vision is blurry", "can't focus"], area: "eyes" },
  { id: "curtain-vision", label: "a curtain or shadow over my vision", synonyms: ["curtain came over my eye", "shadow over my vision", "part of my vision is gone"], area: "eyes" },
  { id: "double-vision", label: "double vision", synonyms: ["seeing double"], area: "eyes" },
  { id: "eye-discharge", label: "redness or discharge from my eye", synonyms: ["red eye", "weeping eye", "gritty eye", "sticky eye"], area: "eyes" },
  { id: "eye-dry", label: "dry or gritty eyes", synonyms: ["dry eyes", "eyes feel gritty"], area: "eyes" },
  { id: "eye-pain", label: "pain in my eye", synonyms: ["sore eye", "eye hurts"], area: "eyes" },
  { id: "eye-swelling", label: "swelling around my eye", synonyms: ["swollen eyelid", "puffy eye"], area: "eyes" },
  { id: "floaters", label: "flashes or floaters in my vision", synonyms: ["floaters", "flashing lights", "specks in my vision"], area: "eyes" },
  { id: "light-hurts", label: "light hurts my eyes", synonyms: ["sensitive to light", "photophobia", "bright light hurts"], area: "eyes" },
  /*
    ⛔ THE LABEL IS "sudden vision loss" BECAUSE THAT IS WHAT SCREENS.

    It read "losing vision", which matched nothing: the vision_loss list holds
    "sudden vision loss", "lost my vision" and "lost vision in", and the
    present participle is in none of them. Found by
    `check_picker_coverage.py`. The lay wordings people type are kept as
    synonyms so the entry is still findable; only the inserted label changed.
  */
  { id: "vision-loss", label: "sudden vision loss", synonyms: ["losing vision", "lost my sight", "can't see", "went blind"], area: "eyes" },

  // ── ears, nose and throat ──
  { id: "ear-discharge", label: "discharge from my ear", synonyms: ["fluid from my ear", "ear is weeping", "pus from my ear"], area: "ear-nose-throat" },
  { id: "earache", label: "an earache", synonyms: ["ear hurts", "sore ear", "ear pain"], area: "ear-nose-throat" },
  { id: "face-pressure", label: "pain or pressure in my face", synonyms: ["sinus pressure", "pressure behind my cheeks", "face aches"], area: "ear-nose-throat" },
  { id: "hearing-loss", label: "trouble hearing", synonyms: ["can't hear", "muffled hearing", "hearing has gone"], area: "ear-nose-throat" },
  { id: "nosebleed", label: "bleeding from my nose", synonyms: ["nosebleed", "nose is bleeding"], area: "ear-nose-throat" },
  { id: "runny-nose", label: "a runny or stuffy nose", synonyms: ["blocked nose", "congested", "stuffy nose", "runny nose"], area: "ear-nose-throat" },
  { id: "sneezing", label: "sneezing a lot", synonyms: ["sneezing", "keep sneezing"], area: "ear-nose-throat" },
  { id: "sore-throat", label: "a sore throat", synonyms: ["throat hurts", "scratchy throat", "painful to swallow"], area: "ear-nose-throat" },
  { id: "swallow-trouble", label: "trouble swallowing", synonyms: ["hard to swallow", "food gets stuck", "can't swallow properly"], area: "ear-nose-throat" },
  { id: "swollen-glands", label: "swollen glands in my neck", synonyms: ["swollen glands", "lumps in my neck", "swollen neck"], area: "ear-nose-throat" },
  // ⛔ "my throat is closing" — the hedge ("feels like it is") broke the match.
  { id: "throat-closing", label: "my throat is closing", synonyms: ["throat closing", "throat tightening", "throat feels like it is closing"], area: "ear-nose-throat" },
  { id: "tinnitus", label: "ringing in my ears", synonyms: ["ringing ears", "buzzing in my ears", "hissing in my ear"], area: "ear-nose-throat" },
  { id: "voice-hoarse", label: "a hoarse voice", synonyms: ["lost my voice", "croaky", "hoarse"], area: "ear-nose-throat" },

  // ── mouth and teeth ──
  { id: "bad-breath", label: "bad breath", synonyms: ["breath smells", "halitosis"], area: "mouth-and-teeth" },
  { id: "dry-mouth", label: "a dry mouth", synonyms: ["mouth is dry", "no saliva"], area: "mouth-and-teeth" },
  { id: "gums-bleeding", label: "bleeding gums", synonyms: ["gums bleed", "blood when I brush"], area: "mouth-and-teeth" },
  { id: "jaw-pain", label: "jaw pain or clicking", synonyms: ["jaw clicks", "jaw aches", "sore jaw"], area: "mouth-and-teeth" },
  { id: "mouth-sore", label: "a sore or blister in my mouth", synonyms: ["mouth sore", "sore in my mouth", "blister on my lip"], area: "mouth-and-teeth" },
  { id: "mouth-white-patches", label: "white patches in my mouth", synonyms: ["white patches", "coating on my tongue"], area: "mouth-and-teeth" },
  { id: "tooth-broken", label: "a broken or knocked-out tooth", synonyms: ["broken tooth", "knocked out tooth", "chipped tooth"], area: "mouth-and-teeth" },
  { id: "tooth-pain", label: "toothache", synonyms: ["tooth hurts", "sore tooth", "throbbing tooth"], area: "mouth-and-teeth" },
  { id: "face-swelling-jaw", label: "swelling in my face or jaw", synonyms: ["swollen cheek", "swollen jaw", "puffy face"], area: "mouth-and-teeth" },

  // ── chest ──
  { id: "chest-burning", label: "a burning feeling in my chest", synonyms: ["burning chest"], area: "chest" },
  { id: "chest-pain", label: "chest pain", synonyms: ["pain in my chest", "my chest hurts", "sore chest"], area: "chest" },
  { id: "chest-pain-breathing", label: "chest pain when I breathe in", synonyms: ["hurts to breathe", "sharp pain when I breathe"], area: "chest" },
  { id: "chest-pain-exertion", label: "chest pain when I exercise", synonyms: ["chest gets tight when I walk", "chest pain walking uphill"], area: "chest" },
  { id: "chest-pressure", label: "pressure or tightness in my chest", synonyms: ["chest tightness", "chest feels tight", "crushing chest", "weight on my chest", "pressure in my chest"], area: "chest" },
  { id: "heart-racing", label: "my heart is racing or skipping", synonyms: ["palpitations", "heart pounding", "racing heart", "fluttering"], area: "chest" },
  // ⛔ Names the chest, because that is what screens. "pain spreading to my
  // arm, neck or jaw" matched nothing: the cardiac list holds "pain radiating
  // to arm" and "left arm pain and chest", and a compound label contains
  // neither. Found by `check_picker_coverage.py`.
  { id: "pain-to-arm", label: "chest pain spreading to my arm", synonyms: ["pain in my arm", "pain in my jaw", "radiating pain", "spreading to my neck"], area: "chest" },

  // ── breathing ──
  { id: "breathless", label: "shortness of breath", synonyms: ["short of breath", "breathless", "can't catch my breath", "hard to breathe", "trouble breathing"], area: "breathing" },
  { id: "breathless-lying", label: "breathless when lying flat", synonyms: ["breathless lying flat", "can't lie flat", "propped up on pillows"], area: "breathing" },
  { id: "breathless-walking", label: "breathless walking a short distance", synonyms: ["out of breath walking", "breathless walking"], area: "breathing" },
  { id: "cough-dry", label: "a dry cough", synonyms: ["tickly cough", "hacking cough"], area: "breathing" },
  { id: "cough-persistent", label: "a cough that will not go away", synonyms: ["cough for weeks", "cough won't go away", "lingering cough"], area: "breathing" },
  { id: "cough-phlegm", label: "a cough bringing up phlegm", synonyms: ["chesty cough", "productive cough", "coughing up mucus"], area: "breathing" },
  { id: "coughing-blood", label: "coughing up blood", synonyms: ["blood when I cough", "bloody phlegm"], area: "breathing" },
  { id: "noisy-breathing", label: "noisy or rattly breathing", synonyms: ["rattly chest", "noisy breathing", "grunting"], area: "breathing" },
  { id: "wheezing", label: "wheezing", synonyms: ["whistling when I breathe", "wheezy"], area: "breathing" },

  // ── stomach and digestion ──
  { id: "abdominal-pain", label: "stomach pain", synonyms: ["belly pain", "tummy hurts", "pain in my abdomen", "stomach ache", "cramping"], area: "stomach" },
  { id: "abdominal-pain-sudden", label: "stomach pain that came on suddenly", synonyms: ["sudden stomach pain", "sudden belly pain"], area: "stomach" },
  { id: "abdominal-swelling", label: "swelling in my belly", synonyms: ["swollen belly", "distended stomach", "belly is hard"], area: "stomach" },
  { id: "appetite-loss", label: "no appetite", synonyms: ["not eating", "can't eat", "lost my appetite"], area: "stomach" },
  { id: "bloating", label: "bloating", synonyms: ["bloated", "gassy"], area: "stomach" },
  { id: "full-quickly", label: "feeling full very quickly", synonyms: ["full after a few bites", "can't finish a meal"], area: "stomach" },
  { id: "heartburn", label: "heartburn or reflux", synonyms: ["burning in my chest after eating", "acid reflux", "indigestion"], area: "stomach" },
  { id: "nausea", label: "feeling sick", synonyms: ["nauseous", "nausea", "queasy", "feel like throwing up"], area: "stomach" },
  { id: "upper-stomach-pain", label: "pain in my upper stomach", synonyms: ["pain under my ribs", "upper belly pain"], area: "stomach" },
  { id: "vomiting", label: "vomiting", synonyms: ["throwing up", "being sick"], area: "stomach" },
  { id: "vomiting-blood", label: "vomiting blood", synonyms: ["blood when I am sick", "threw up blood", "coffee grounds"], area: "stomach" },
  { id: "vomiting-persistent", label: "vomiting that will not stop", synonyms: ["can't keep anything down", "vomiting everything", "can't keep fluids down"], area: "stomach" },

  // ── bowels ──
  { id: "bowel-habit-change", label: "a change in my usual bowel habit", synonyms: ["bowel habit has changed", "going differently"], area: "bowels" },
  { id: "bowel-incontinence", label: "losing control of my bowels", synonyms: ["can't control my bowels", "soiling myself"], area: "bowels" },
  { id: "blood-in-stool", label: "blood when I go to the toilet", synonyms: ["blood in my stool", "bleeding from my bottom"], area: "bowels" },
  { id: "constipation", label: "constipation", synonyms: ["can't go", "haven't been", "constipated"], area: "bowels" },
  { id: "diarrhoea", label: "diarrhoea", synonyms: ["loose stools", "runny stools", "diarrhea", "the runs"], area: "bowels" },
  { id: "mucus-stool", label: "mucus in my stool", synonyms: ["slime in my stool"], area: "bowels" },
  { id: "no-wind-or-stool", label: "not passed wind or stool for days", synonyms: ["nothing is moving", "no bowel movement for days"], area: "bowels" },
  { id: "painful-stool", label: "pain when I go to the toilet", synonyms: ["hurts to go", "stinging when I go"], area: "bowels" },
  // ⛔ No "or": the literal is "black tarry stools" and the conjunction split it.
  { id: "stool-black", label: "black tarry stools", synonyms: ["black stools", "tarry stools"], area: "bowels" },

  // ── waterworks ──
  { id: "blood-in-urine", label: "blood in my urine", synonyms: ["blood when I pee", "pink urine", "red urine"], area: "urinary" },
  { id: "cant-urinate", label: "not able to pee", synonyms: ["can't pee", "can't pass urine", "nothing comes out"], area: "urinary" },
  { id: "flank-pain", label: "pain in my side or lower back", synonyms: ["pain in my side", "flank pain", "kidney pain"], area: "urinary" },
  { id: "painful-urination", label: "pain or burning when I pee", synonyms: ["burning when I pee", "stinging when I urinate", "painful urination"], area: "urinary" },
  { id: "urinating-night", label: "getting up at night to pee", synonyms: ["peeing at night", "up several times a night"], area: "urinary" },
  { id: "urinating-often", label: "needing to pee much more often", synonyms: ["peeing a lot", "going all the time", "frequent urination"], area: "urinary" },
  { id: "urine-cloudy", label: "cloudy or strong-smelling urine", synonyms: ["cloudy urine", "smelly urine"], area: "urinary" },
  { id: "urine-leaking", label: "leaking urine", synonyms: ["leaking when I cough", "wetting myself", "incontinence"], area: "urinary" },
  { id: "urine-weak-stream", label: "a weak stream when I pee", synonyms: ["weak stream", "trouble starting", "dribbling"], area: "urinary" },

  // ── back, arms and legs ──
  { id: "back-pain", label: "back pain", synonyms: ["my back hurts", "sore back", "aching back"], area: "back-and-limbs" },
  { id: "back-pain-leg", label: "back pain that goes down my leg", synonyms: ["pain down my leg", "shooting pain in my leg", "sciatica"], area: "back-and-limbs" },
  { id: "calf-pain", label: "pain in my calf", synonyms: ["sore calf", "calf hurts", "tender calf"], area: "back-and-limbs" },
  { id: "cramping-walking", label: "cramping in my legs when I walk", synonyms: ["legs cramp when I walk", "cramp that stops when I rest"], area: "back-and-limbs" },
  { id: "joint-pain", label: "painful joints", synonyms: ["joint pain", "sore joints", "aching joints"], area: "back-and-limbs" },
  { id: "joint-swelling", label: "a swollen joint", synonyms: ["swollen knee", "swollen ankle", "puffy joint"], area: "back-and-limbs" },
  { id: "leg-swelling", label: "swelling in my leg", synonyms: ["swollen leg", "swollen calf", "puffy ankles"], area: "back-and-limbs" },
  { id: "morning-stiffness", label: "stiffness in the morning", synonyms: ["stiff in the morning", "takes a while to loosen up"], area: "back-and-limbs" },
  { id: "muscle-aches", label: "aching muscles", synonyms: ["muscle aches", "body aches", "everything aches"], area: "back-and-limbs" },
  { id: "muscle-weakness", label: "weak muscles", synonyms: ["muscle weakness", "legs feel weak", "arms feel weak"], area: "back-and-limbs" },
  { id: "neck-stiff", label: "a stiff neck", synonyms: ["neck is stiff", "can't move my neck", "stiff neck"], area: "back-and-limbs" },
  { id: "shoulder-pain", label: "shoulder pain", synonyms: ["sore shoulder", "shoulder hurts"], area: "back-and-limbs" },
  { id: "weight-bearing", label: "not able to put weight on it", synonyms: ["can't put weight", "can't stand on it", "can't walk on it"], area: "back-and-limbs" },

  // ── skin ──
  { id: "blisters", label: "blisters", synonyms: ["blistering", "water blisters"], area: "skin" },
  { id: "bruising", label: "bruising easily", synonyms: ["bruises", "bruising"], area: "skin" },
  { id: "dry-skin", label: "dry or flaking skin", synonyms: ["dry skin", "flaky skin", "peeling skin"], area: "skin" },
  { id: "hair-loss", label: "hair falling out", synonyms: ["losing my hair", "hair thinning"], area: "skin" },
  { id: "itching", label: "itching", synonyms: ["itchy", "scratching"], area: "skin" },
  { id: "jaundice", label: "yellow skin or eyes", synonyms: ["yellow eyes", "jaundice", "gone yellow"], area: "skin" },
  { id: "lump-under-skin", label: "a lump under my skin", synonyms: ["lump", "bump under the skin"], area: "skin" },
  { id: "mole-changed", label: "a mole that has changed", synonyms: ["mole has changed", "changing mole", "new dark spot"], area: "skin" },
  { id: "pus-discharge", label: "pus or discharge from a sore", synonyms: ["pus", "oozing", "weeping sore"], area: "skin" },
  { id: "rash", label: "a rash", synonyms: ["spots", "blotches", "red patches"], area: "skin" },
  { id: "rash-no-fade", label: "a rash that does not fade when pressed", synonyms: ["rash that doesn't fade", "glass test", "non-blanching rash"], area: "skin" },
  { id: "redness-spreading", label: "redness spreading from a wound", synonyms: ["spreading redness", "red streaks", "skin is hot to touch"], area: "skin" },
  /*
    ⛔ SPLIT INTO TWO, AND THE REASON IS A SAFETY ONE.

    This was one entry reading "swelling of my face, lips or tongue", and
    `check_picker_coverage.py` found that it screened as NOTHING. The
    anaphylaxis list holds "lips are swelling" and "tongue is swelling" as
    contiguous literals, and neither survives being folded into a compound
    phrase — "lips or tongue are swelling" contains neither.

    A label offered by this app that names a red flag and reaches no screening
    is worse than not offering it: the person tapped the words MedHelp put in
    front of them and got less than if they had typed their own.

    Keep these single-concept. A compound label is also what rule 3 is about —
    it asserts that two things go together — so the split is the right shape
    twice over.
  */
  { id: "swelling-lips", label: "my lips are swelling", synonyms: ["swollen lips", "lips swelling up"], area: "skin" },
  { id: "swelling-tongue", label: "my tongue is swelling", synonyms: ["swollen tongue", "tongue feels too big"], area: "skin" },
  { id: "swelling-face", label: "my face is swelling", synonyms: ["swollen face", "face is puffy"], area: "skin" },
  { id: "wound-not-healing", label: "a cut or sore that will not heal", synonyms: ["wound won't heal", "sore that won't heal"], area: "skin" },

  // ── how you feel overall ──
  { id: "chills", label: "chills or shivering", synonyms: ["shivering", "shivers", "cold sweats"], area: "whole-body" },
  { id: "cold-all-the-time", label: "feeling cold all the time", synonyms: ["always cold", "can't get warm"], area: "whole-body" },
  { id: "dizzy", label: "feeling dizzy or lightheaded", synonyms: ["dizzy", "lightheaded", "woozy"], area: "whole-body" },
  { id: "fainted", label: "fainting or passing out", synonyms: ["passed out", "blacked out", "fainted", "collapsed"], area: "whole-body" },
  { id: "fever", label: "a fever", synonyms: ["temperature", "burning up", "feverish", "hot"], area: "whole-body" },
  { id: "fever-recurring", label: "a temperature that keeps coming back", synonyms: ["fever keeps returning", "temperature on and off"], area: "whole-body" },
  { id: "generally-unwell", label: "feeling generally unwell", synonyms: ["feeling off", "not right", "under the weather", "feel awful"], area: "whole-body" },
  { id: "lump-somewhere", label: "a lump I can feel", synonyms: ["found a lump", "new lump"], area: "whole-body" },
  { id: "night-sweats", label: "night sweats", synonyms: ["sweating at night", "drenched at night"], area: "whole-body" },
  { id: "sweating-heavy", label: "sweating much more than usual", synonyms: ["drenching sweats", "sweating a lot"], area: "whole-body" },
  { id: "thirsty", label: "thirsty all the time", synonyms: ["constant thirst", "always thirsty", "drinking constantly"], area: "whole-body" },
  { id: "tired", label: "feeling very tired", synonyms: ["exhausted", "fatigue", "no energy", "worn out", "extremely tired"], area: "whole-body" },
  { id: "weight-loss", label: "losing weight without trying", synonyms: ["unexplained weight loss", "losing weight"], area: "whole-body" },

  // ── mood and thinking ──
  { id: "anxious", label: "feeling anxious or panicky", synonyms: ["anxiety", "panicking", "on edge", "panic"], area: "mood" },
  { id: "concentration", label: "trouble concentrating", synonyms: ["can't concentrate", "can't focus", "mind wanders"], area: "mood" },
  { id: "confused", label: "feeling confused or muddled", synonyms: ["confusion", "can't think straight", "disoriented", "muddled"], area: "mood" },
  { id: "hallucinations", label: "hearing or seeing things others do not", synonyms: ["hearing voices", "seeing things"], area: "mood" },
  { id: "low-mood", label: "feeling very low", synonyms: ["depressed", "low mood", "hopeless", "can't cope"], area: "mood" },
  { id: "lost-interest", label: "losing interest in everything", synonyms: ["no interest", "nothing feels worth it"], area: "mood" },
  { id: "memory-problems", label: "memory problems", synonyms: ["forgetting things", "memory is going", "keep forgetting"], area: "mood" },
  { id: "mood-swings", label: "mood swings", synonyms: ["up and down", "mood changes"], area: "mood" },
  { id: "self-harm", label: "thoughts of harming myself", synonyms: ["hurting myself", "hurt myself", "ending it", "suicidal"], area: "mood" },
  { id: "sleep-trouble", label: "trouble sleeping", synonyms: ["can't sleep", "insomnia", "waking up a lot"], area: "mood" },
  { id: "substance-use", label: "drinking or using more than I want to", synonyms: ["drinking too much", "can't stop drinking", "using more"], area: "mood" },

  // ── movement and senses ──
  { id: "face-drooping", label: "my face is drooping on one side", synonyms: ["face drooping", "drooping face", "one side of my face", "mouth droops"], area: "nerves-and-senses" },
  { id: "hands-feet-numb", label: "loss of feeling in my hands or feet", synonyms: ["numb hands", "numb feet", "can't feel my toes"], area: "nerves-and-senses" },
  { id: "numbness", label: "numbness or tingling", synonyms: ["pins and needles", "numb", "tingling"], area: "nerves-and-senses" },
  { id: "room-spinning", label: "the room is spinning", synonyms: ["room spins", "everything is spinning", "vertigo"], area: "nerves-and-senses" },
  { id: "seizure", label: "a seizure or fit", synonyms: ["fit", "convulsion", "seizure"], area: "nerves-and-senses" },
  // ⛔ "slurred speech", not "slurred or muddled speech" — one of the stroke
  // signs, and the conjunction in the middle defeated the literal entirely.
  { id: "slurred-speech", label: "slurred speech", synonyms: ["can't speak properly", "slurring", "muddled speech"], area: "nerves-and-senses" },
  { id: "smell-taste-loss", label: "loss of taste or smell", synonyms: ["can't taste", "can't smell", "lost my sense of smell"], area: "nerves-and-senses" },
  { id: "tremor", label: "shaking or a tremor", synonyms: ["shaky hands", "tremor", "trembling"], area: "nerves-and-senses" },
  { id: "unsteady", label: "feeling unsteady on my feet", synonyms: ["losing my balance", "keep stumbling", "unsteady"], area: "nerves-and-senses" },
  { id: "walking-trouble", label: "trouble walking", synonyms: ["can't walk properly", "legs won't work", "dragging my foot"], area: "nerves-and-senses" },
  { id: "weakness-one-side", label: "weakness on one side of my body", synonyms: ["weak arm", "weak leg", "one side is weak", "can't lift my arm"], area: "nerves-and-senses" },
  // ⛔ The first-person form is the one the stroke list holds.
  { id: "words-trouble", label: "I can't get my words out", synonyms: ["trouble finding words", "words won't come out"], area: "nerves-and-senses" },

  // ── periods and women's health ──
  { id: "breast-lump", label: "a lump in my breast", synonyms: ["lump in my breast", "breast lump"], area: "womens-health" },
  { id: "breast-pain", label: "breast pain or changes", synonyms: ["sore breast", "breast changes", "nipple discharge"], area: "womens-health" },
  { id: "hot-flushes", label: "hot flushes", synonyms: ["hot flashes", "flushing"], area: "womens-health" },
  { id: "periods-heavy", label: "heavy periods", synonyms: ["heavy bleeding", "flooding"], area: "womens-health" },
  { id: "periods-missed", label: "missed periods", synonyms: ["period is late", "no period"], area: "womens-health" },
  { id: "periods-painful", label: "painful periods", synonyms: ["period pain", "period cramps"], area: "womens-health" },
  { id: "pelvic-pain", label: "pain in my pelvis", synonyms: ["pelvic pain", "pain low down"], area: "womens-health" },
  { id: "sex-painful", label: "pain during sex", synonyms: ["painful sex", "hurts during sex"], area: "womens-health" },
  { id: "vaginal-bleeding", label: "bleeding between periods", synonyms: ["spotting", "bleeding after sex", "unusual bleeding"], area: "womens-health" },
  { id: "vaginal-discharge", label: "unusual vaginal discharge", synonyms: ["discharge", "smelly discharge", "itching down below"], area: "womens-health" },

  // ── men's health ──
  { id: "erection-trouble", label: "difficulty getting an erection", synonyms: ["erectile problems", "can't get an erection"], area: "mens-health" },
  { id: "genital-sore", label: "a sore or lump on my genitals", synonyms: ["sore on my genitals", "lump on my penis"], area: "mens-health" },
  { id: "penile-discharge", label: "discharge from my penis", synonyms: ["discharge", "dripping"], area: "mens-health" },
  { id: "scrotum-swelling", label: "swelling in my scrotum", synonyms: ["swollen scrotum", "swelling down below"], area: "mens-health" },
  { id: "testicle-lump", label: "a lump in my testicle", synonyms: ["lump in my testicle", "testicular lump"], area: "mens-health" },
  { id: "testicle-pain", label: "pain in my testicle", synonyms: ["testicle hurts", "sore testicle", "pain in my balls"], area: "mens-health" },
  { id: "urine-start-trouble", label: "trouble starting to pee", synonyms: ["hard to start", "straining to pee"], area: "mens-health" },

  // ── pregnancy ──
  { id: "contractions", label: "contractions", synonyms: ["tightenings", "labour pains"], area: "pregnancy" },
  { id: "pregnancy-bleeding", label: "bleeding while pregnant", synonyms: ["pregnant and bleeding", "spotting while pregnant"], area: "pregnancy" },
  { id: "pregnancy-headache", label: "a bad headache while pregnant", synonyms: ["headache while pregnant"], area: "pregnancy" },
  { id: "pregnancy-movements", label: "my baby is moving less than usual", synonyms: ["reduced movements", "baby not moving"], area: "pregnancy" },
  { id: "pregnancy-pain", label: "severe pain while pregnant", synonyms: ["pregnant and severe pain", "bad pain while pregnant"], area: "pregnancy" },
  { id: "pregnancy-swelling", label: "swelling in my hands and face while pregnant", synonyms: ["swollen hands while pregnant", "puffy face while pregnant"], area: "pregnancy" },
  { id: "pregnancy-vomiting", label: "vomiting constantly while pregnant", synonyms: ["can't keep anything down while pregnant", "morning sickness"], area: "pregnancy" },
  { id: "waters-broken", label: "my waters have broken", synonyms: ["waters broke", "fluid leaking"], area: "pregnancy" },

  // ── babies and children ──
  { id: "child-barking-cough", label: "my child has a barking cough", synonyms: ["barking cough", "seal-like cough"], area: "children" },
  { id: "child-breathing-fast", label: "my child is breathing quickly", synonyms: ["breathing fast", "working hard to breathe", "sucking in at the ribs"], area: "children" },
  { id: "child-crying", label: "my child is crying inconsolably", synonyms: ["won't stop crying", "inconsolable"], area: "children" },
  { id: "child-fewer-nappies", label: "fewer wet nappies than usual", synonyms: ["fewer wet diapers", "not weeing much"], area: "children" },
  { id: "child-not-drinking", label: "my child is not drinking", synonyms: ["won't drink", "refusing fluids"], area: "children" },
  { id: "child-not-feeding", label: "my baby is not feeding", synonyms: ["won't feed", "off their feeds"], area: "children" },
  { id: "child-pulling-ear", label: "my child is pulling at their ear", synonyms: ["tugging at ear"], area: "children" },
  { id: "child-rash", label: "my child has a rash", synonyms: ["rash on my child", "spots on my child"], area: "children" },
  { id: "child-sleepy", label: "my baby is very sleepy and hard to wake", synonyms: ["floppy baby", "hard to wake", "unusually sleepy"], area: "children" },
  { id: "child-temperature", label: "my baby has a fever", synonyms: ["baby has a temperature", "baby feels hot", "newborn fever"], area: "children" },

  // ── injuries and accidents ──
  { id: "animal-bite", label: "a bite from an animal", synonyms: ["dog bite", "cat bite", "animal bite"], area: "injuries" },
  { id: "burn", label: "a burn or scald", synonyms: ["burn", "scalded", "burnt myself"], area: "injuries" },
  { id: "car-accident", label: "an injury from a car accident", synonyms: ["car crash", "road accident"], area: "injuries" },
  { id: "cut-bleeding", label: "a cut that will not stop bleeding", synonyms: ["bleeding won't stop", "can't stop the bleeding"], area: "injuries" },
  { id: "cut-deep", label: "a deep cut", synonyms: ["deep cut", "might need stitches", "gaping cut"], area: "injuries" },
  { id: "fall-height", label: "a fall from a height", synonyms: ["fell from a height", "fell off a ladder"], area: "injuries" },
  // ⛔ "I hit my head" — how a person says it, and what the list holds. The
  // noun form "a knock to the head" screened as nothing.
  { id: "head-injury", label: "I hit my head", synonyms: ["head injury", "banged my head", "knock to the head"], area: "injuries" },
  { id: "possible-fracture", label: "a bone that might be broken", synonyms: ["think I broke it", "broken bone", "looks deformed"], area: "injuries" },
  { id: "sprain", label: "a sprain or twist", synonyms: ["twisted it", "rolled my ankle", "sprained"], area: "injuries" },
  { id: "stuck-in-wound", label: "something stuck in a wound", synonyms: ["something in the wound", "splinter", "glass in it"], area: "injuries" },

  // ── medicines ──
  { id: "med-out-of", label: "I have run out of my medicine", synonyms: ["out of my medication", "need a refill"], area: "medicines" },
  { id: "med-rash", label: "a rash after starting a new medicine", synonyms: ["new rash after taking", "rash from medication"], area: "medicines" },
  { id: "med-reaction", label: "a reaction to my medication", synonyms: ["reaction to my medication", "reaction to the medicine"], area: "medicines" },
  { id: "med-side-effects", label: "side effects from my medicine", synonyms: ["side effect", "since starting the medication"], area: "medicines" },
  { id: "med-stopped", label: "I stopped my medicine and feel unwell", synonyms: ["stopped taking it", "withdrawal"], area: "medicines" },
  // ⛔ "I took too many pills", not "I have taken" — the overdose list holds
  // the simple past and nothing else, so the perfect form screened as nothing.
  // Found by `check_picker_coverage.py`.
  { id: "med-too-many", label: "I took too many pills", synonyms: ["taken too many pills", "took too much", "overdose"], area: "medicines" },
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

  /*
    Two tiers, and ⛔ THIS IS MATCH QUALITY, NEVER SERIOUSNESS.

    Rule 4 forbids ordering the list by how alarming a symptom is, and that
    rule is untouched here: what separates the tiers is purely how much of
    what the user typed a name contains. A phrase whose name contains the
    WHOLE query is a better lexical match than one sharing a single word, and
    with a vocabulary this size that difference decides whether the eight
    slots are useful or noise — typing "pain" touches twenty entries, and
    before this the eight shown were simply the first eight in the file, which
    is to say the ones about the head.

    Within a tier the order is the vocabulary's own. Nothing here reads a
    symptom's meaning, so the ordering is reviewable by reading two string
    comparisons, which is the same standard the rest of this file holds to.
  */
  const whole: Symptom[] = [];
  const partial: Symptom[] = [];

  for (const symptom of SYMPTOMS) {
    if (skip.has(symptom.id)) continue;
    const names = haystack(symptom);
    if (names.some((name) => name.includes(cleaned))) {
      whole.push(symptom);
    } else if (names.some((name) => words.some((word) => name.includes(word)))) {
      partial.push(symptom);
    }
  }

  return [...whole, ...partial].slice(0, MAX_SUGGESTIONS);
}

/**
 * Every phrase filed under one body area, for browsing rather than typing.
 *
 * ⛔ UNCAPPED, DELIBERATELY. `matchSymptoms` returns at most
 * `MAX_SUGGESTIONS` because it is answering a half-typed word and a long list
 * would be noise. This is answering "show me everything about my chest", and
 * truncating that would hide phrases from the one person who came looking for
 * them — someone who cannot or does not want to type, which is the whole
 * reason browsing exists. An area holds a readable number of entries by
 * construction; if one ever grows past that, split the area rather than
 * capping the list.
 *
 * Vocabulary order, which is alphabetical within the area. Not ranked — see
 * rule 4.
 */
export function symptomsInArea(area: Area, exclude: readonly string[] = []): Symptom[] {
  const skip = new Set(exclude);
  return SYMPTOMS.filter((symptom) => symptom.area === area && !skip.has(symptom.id));
}

/** Areas that actually hold at least one phrase, in browse order. */
export function browsableAreas(): Area[] {
  return AREAS_IN_BROWSE_ORDER.filter((area) =>
    SYMPTOMS.some((symptom) => symptom.area === area)
  );
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

/**
 * The separator between a typed description and the phrases picked beside it.
 *
 * ⛔ IT MUST MATCH `merge_selected_symptoms` IN `app/api/intake.py`, AND THE
 * REASON IS A SAFETY ONE. Every phrase in `emergency.py` and
 * `rules_triage.py` is compiled with word boundaries, so two phrases run
 * together match nothing at all — the glued-list bug this repository already
 * shipped once, where "Chest painShortness of breath" screened as neither.
 *
 * The server does the authoritative merge; this constant exists only so the
 * client can show and carry forward the same text the server will assess.
 */
export const PHRASE_SEPARATOR = ". ";

/**
 * What the user is actually submitting: their words plus the phrases they
 * picked, in one string.
 *
 * ⛔ THIS IS A MIRROR, NOT THE SOURCE OF TRUTH. The server composes the text
 * it classifies, from the same parts and with the same separator. This exists
 * for the two places the client needs the same sentence — showing someone
 * what they are about to send, and carrying the reason for visit forward into
 * the appointment flow when the person typed nothing at all and the picked
 * phrases are the only description there is.
 *
 * `symptomVocabulary.test.ts` pins it against the server's separator so the
 * two cannot drift into showing one thing and assessing another.
 */
export function composeDescription(typed: string, ids: readonly string[]): string {
  const parts = [typed.trim(), ...labelsFor(ids)].filter((part) => part.length > 0);
  return parts.join(PHRASE_SEPARATOR);
}
