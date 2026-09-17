import {
  AREA_LABELS,
  SYMPTOMS,
  labelsFor,
  matchSymptoms,
  relatedByArea,
  symptomById,
  type Area,
} from "@/services/symptomVocabulary";

/**
 * The symptom vocabulary is app-authored clinical content, which this
 * repository otherwise forbids. These tests hold the four rules that make it
 * something other than MedHelp diagnosing people.
 *
 * They are shape tests, not clinical ones. Nothing here says the vocabulary is
 * correct — no clinician has read it — only that it stays the kind of thing it
 * was approved as.
 */
describe("the symptom vocabulary is a list of symptoms and nothing more", () => {
  it("attaches no severity, tier or urgency to any entry", () => {
    // ⛔ THE LOAD-BEARING TEST IN THIS FILE.
    //
    // A symptom labelled "mild" or "self-care" is reassurance MedHelp wrote,
    // and the triage design rests on nothing being able to LOWER a tier. Tiers
    // are decided once, downstream, by the classifier reading the whole
    // description. If a field like this is ever wanted, it is a conversation
    // with a clinician, not an edit.
    const forbidden = [
      "severity",
      "tier",
      "urgency",
      "emergent",
      "urgent",
      "selfCare",
      "self_care",
      "priority",
      "score",
      "weight",
      "risk",
    ];

    for (const symptom of SYMPTOMS) {
      const keys = Object.keys(symptom);
      for (const key of keys) {
        expect(forbidden).not.toContain(key);
      }
      // The whole set of fields, pinned. A new one has to be added here
      // deliberately, which is the point.
      expect(keys.sort()).toEqual(["area", "id", "label", "synonyms"]);
    }
  });

  it("names no condition or diagnosis", () => {
    // Symptoms are what a person feels; a condition is what a clinician
    // concludes. A menu of conditions would have the user pick the disease
    // they think they have, which is the app diagnosing by proxy.
    const conditions = [
      "asthma",
      "angina",
      "appendicitis",
      "cancer",
      "covid",
      "diabetes",
      "flu",
      "heart attack",
      "influenza",
      "meningitis",
      "migraine",
      "pneumonia",
      "sepsis",
      "stroke",
      "tonsillitis",
      "ulcer",
    ];

    for (const symptom of SYMPTOMS) {
      const haystack = [symptom.label, ...symptom.synonyms].join(" ").toLowerCase();
      for (const condition of conditions) {
        // Whole words only. A substring check calls "fluttering" a mention of
        // flu, which would make this test fail on phrasing rather than on a
        // condition actually being named.
        expect(haystack).not.toMatch(new RegExp(`\\b${condition}\\b`));
      }
    }
  });

  it("gives every entry a known area and a non-empty label", () => {
    const areas = Object.keys(AREA_LABELS) as Area[];

    for (const symptom of SYMPTOMS) {
      expect(areas).toContain(symptom.area);
      expect(symptom.label.trim().length).toBeGreaterThan(0);
      expect(symptom.id.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate ids", () => {
    const ids = SYMPTOMS.map((symptom) => symptom.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("makes no network call of any kind", () => {
    // The vocabulary is on the device so that a partially typed symptom never
    // leaves it. A lookup that went to the server would put health text in a
    // request — and, if it were ever a GET, in an access log.
    const fetchSpy = jest.spyOn(global, "fetch" as never);

    matchSymptoms("chest pain");
    relatedByArea(["chest-pain"]);
    labelsFor(["chest-pain"]);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("matching what the user typed", () => {
  it("finds a symptom by its own name", () => {
    const hits = matchSymptoms("I have a sore throat");
    expect(hits.map((symptom) => symptom.id)).toContain("sore-throat");
  });

  it("finds a symptom by a synonym without ever showing the synonym", () => {
    // Synonyms are match input only, the same rule as MedlinePlus altTitles.
    const hits = matchSymptoms("I feel nauseous");
    const nausea = hits.find((symptom) => symptom.id === "nausea");

    expect(nausea).toBeDefined();
    expect(nausea?.label).toBe("feeling sick");
  });

  it("ignores text too short to mean anything", () => {
    // Below the floor every symptom matches and the list is noise.
    expect(matchSymptoms("I")).toEqual([]);
    expect(matchSymptoms("a")).toEqual([]);
    expect(matchSymptoms("")).toEqual([]);
  });

  it("is unaffected by case and punctuation", () => {
    const plain = matchSymptoms("pins and needles");
    const shouted = matchSymptoms("PINS-AND-NEEDLES!!");

    expect(shouted.map((s) => s.id)).toEqual(plain.map((s) => s.id));
    expect(plain.map((s) => s.id)).toContain("numbness");
  });

  it("returns the same list for the same text every time", () => {
    // Everything downstream of here is deterministic and is entitled to
    // deterministic input.
    const once = matchSymptoms("my chest hurts").map((s) => s.id);
    const twice = matchSymptoms("my chest hurts").map((s) => s.id);

    expect(once).toEqual(twice);
  });

  it("does not offer something already added", () => {
    const hits = matchSymptoms("sore throat", ["sore-throat"]);
    expect(hits.map((s) => s.id)).not.toContain("sore-throat");
  });

  it("returns entries in the vocabulary's own order, never by seriousness", () => {
    // ⛔ Ordering symptoms by how alarming they are would be the clinical
    // judgement this file is not allowed to make — the same rule that stops
    // the app reordering MedlinePlus topics or ranking providers.
    const hits = matchSymptoms("pain");
    const positions = hits.map((hit) => SYMPTOMS.findIndex((s) => s.id === hit.id));
    const sorted = [...positions].sort((a, b) => a - b);

    expect(positions).toEqual(sorted);
  });
});

describe("related phrases are anatomical, not clinical", () => {
  it("offers other phrases about the same body area", () => {
    const related = relatedByArea(["chest-pain"]);

    expect(related.length).toBeGreaterThan(0);
    for (const symptom of related) {
      expect(symptom.area).toBe("chest");
    }
  });

  it("never offers something from an unrelated area", () => {
    // ⛔ This is the test that stops the list becoming a screening
    // questionnaire. If "chest pain" ever started suggesting a phrase from
    // another area, the app would be asserting a clinical association it has
    // no basis for — and, on a cardiac description, effectively prompting for
    // red flags.
    const related = relatedByArea(["sore-throat"]);
    const areas = new Set(related.map((symptom) => symptom.area));

    expect([...areas]).toEqual(["ear-nose-throat"]);
  });

  it("never repeats something already selected", () => {
    const related = relatedByArea(["sore-throat", "earache"]);
    const ids = related.map((symptom) => symptom.id);

    expect(ids).not.toContain("sore-throat");
    expect(ids).not.toContain("earache");
  });

  it("returns nothing when nothing is selected", () => {
    expect(relatedByArea([])).toEqual([]);
  });
});

describe("turning a selection into text", () => {
  it("returns labels in the vocabulary's order, not the tap order", () => {
    // Deterministic input again: the same selection must always produce the
    // same description, whichever order the user happened to tap.
    const tappedOneWay = labelsFor(["vomiting", "fever"]);
    const tappedTheOther = labelsFor(["fever", "vomiting"]);

    expect(tappedOneWay).toEqual(tappedTheOther);
  });

  it("drops an id this build does not know rather than guessing", () => {
    // The same rule as an unknown evidence id becoming no citation, and a
    // misread drug name never being snapped to the nearest real one.
    expect(labelsFor(["fever", "not-a-real-symptom"])).toEqual(["a fever"]);
    expect(symptomById("not-a-real-symptom")).toBeUndefined();
  });

  it("returns the label exactly as it is rendered", () => {
    // What the user saw on the chip is what reaches the classifier. A phrase
    // that was reworded on the way out would be the app putting words in
    // somebody's mouth.
    const [label] = labelsFor(["chest-pressure"]);
    expect(label).toBe(symptomById("chest-pressure")?.label);
  });
});
