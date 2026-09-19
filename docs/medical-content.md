# Medical content: where it comes from

Detail behind CLAUDE.md, section "Medical content". The rules in CLAUDE.md are binding; this file is the reasoning, the measurements and the known limits.

## Medical content: where it comes from

The app never authors medical content. All symptom and condition text is
fetched from **MedlinePlus**, published by the US National Library of Medicine
(NIH), through its public health-topics API. No API key is required.

Rules for anyone extending this:

- Render source text **verbatim**. Do not summarise, paraphrase, shorten, or
  split it into your own sections. Rewriting sourced material makes it
  app-authored medical content.
- Do not extract "causes" (or any other clinical category) out of a summary.
  A bulleted list in these topics is sometimes causes, sometimes symptoms,
  sometimes treatments; relabelling one as another invents a clinical claim.
  The source's own topic categories are surfaced as "May be associated with".
- Always carry attribution (`source_name`) and the link back to the topic.
- If the source is unavailable, show an error. Never fall back to generated
  content.
- Free text is reduced to search terms before lookup
  (`backend/app/services/search_terms.py`): filler is deleted, then the query
  broadens a word at a time until something matches. This is retrieval only —
  it chooses which source article to fetch and never alters the text shown.
  Deterministic, no model, no key.

  Three rules in that file exist because of measured wrong answers, not
  theory, and each one is orthographic or positional rather than clinical:

  - **Conversational scaffolding is filler** (`_CONVERSATIONAL`). "my doctor
    is away and I have got a pounding headache" used to search *"doctor away
    pounding"* before it ever searched "headache", and "not really sure what
    is going on…" attached "Cholesterol Levels: What You Need to Know" on the
    word *what*.
  - **Single words are tried last-word-first.** English puts the complaint at
    the end and its qualifiers in front, so "cough" is tried before "dry" and
    "cholesterol" before "high". Front-first is what sent "a dry cough" to
    "Dry Mouth" and "painful urination" to "Chest Pain".
  - **Negations are kept but never searched or matched alone**
    (`_NEGATIONS`). "not going down" still means something; the bare word
    "not" returned "Advance Directives", published by NLM under the name "Do
    Not Resuscitate", and attached it to a headache.
- A topic is only shown if **a name the source gives it contains a word the
  user wrote** (`names_match`) — its title, or one of NLM's own published
  `altTitle` synonyms. The upstream ranking is loose — "swollen ankle" returns
  "Diabetic Heart Disease" above anything about ankles, and printing that
  under someone's description reads as a suggested diagnosis. Non-matching
  topics are dropped, never reordered: ranking health topics by relevance
  would be a clinical judgement this app may not make.

  The alternate titles matter because NLM files topics under a clinical
  heading and publishes the lay name separately: "Bunions" is an altTitle of
  "Toe Injuries and Disorders", "Sunburn" of "Sun Exposure", "Plantar
  Fasciitis" of "Heel Injuries and Disorders". Matching only the title told
  those users nothing matched, while the source was saying that word is the
  topic's name. They are **match input only** and are never rendered.
- **Known limit:** the filter is lexical, so a context word that happens to
  name a topic still gets through — "my head has been pounding" returns
  "Head and Neck Cancer", "nauseous after eating" returns "Eating Disorders".
  Both were re-checked against the live service after the changes above and
  both still happen. **This is still the reason the feature is gated off.**
- Retrieval accuracy is measured, not asserted. Against 1,190 synthetic
  descriptions run through the live service, the share that attach a topic
  actually about the complaint went from **70.8% to 91.0%**, and off-target
  attachments fell from 255 to 37. Queries per assessment fell too — 1,409
  distinct upstream searches became 557, and 85% of assessments now match on
  the first query. Anyone changing this file should re-measure rather than
  reason about it.

### ⛔ Related reading is gated off (`MEDLINEPLUS_TOPICS_ENABLED=false`)

Intake ships with reading material **switched off**, after a compliance review
found the limit above unacceptable to put in front of users: a frightening,
unrelated topic rendered under a person's own description reads as a suggested
diagnosis regardless of the framing around it.

Do not switch it on until a clinician has ruled on how topics are chosen.

- While off, **no MedlinePlus request is made at all**, so no symptom text
  reaches NLM and that vendor's BAA question is moot for as long as it stays
  off.
- The retrieval code (`app/services/search_terms.py`) and its tests are intact
  and still exercised — the flag gates the call, not the code.
- A lexical tightening was tried and rejected: requiring more than a bare
  body-part word to match empties the good cases ("swollen ankle" → nothing).
  Telling a location word from a symptom word is a semantic judgement, so the
  realistic fix is model-assisted topic selection — still retrieval, not
  authoring — which needs its own review.
  - The second example that note used to give, "my lower back hurts" → "How
    to Lower Cholesterol", **no longer happens**: single-word queries are now
    tried last-word-first, so "back" is searched before "lower" and the
    description returns "Back Injuries" and "Back Pain". That fixes one
    documented wrong answer. It does not fix the class — "my head has been
    pounding" still returns "Head and Neck Cancer", because *head* is a word
    the person genuinely wrote and a topic is genuinely named after it.
- Symptom intake attaches this reading to every tier except EMERGENT, where
  the only thing worth showing is how to get emergency help and a content
  fetch would just delay it. When nothing matches, the screen says so rather
  than filling the gap.

### Third-party vendor: NLM / MedlinePlus — BAA status

Every symptom search is transmitted to `wsearch.nlm.nih.gov`, a third party,
carrying free-text health input written by the user.

- **No BAA is in place, and NLM does not sign one.** If this app ever handles
  data covered by HIPAA, this call path needs a privacy/legal decision — not
  an engineering one. Options include proxying with the query stripped of
  identifiers, licensing a redistributable dataset and serving it locally, or
  accepting the exposure with user consent.
- The search screen shows a user-visible notice that searches leave the app.
- The user's text reaches the app's own backend by **POST**, never as a URL
  query string, so it stays out of our access logs, proxies, and crash
  reporters.
- **The onward call to NLM is a GET, with the search term in the URL**
  (`app/services/medlineplus.py`). This bullet previously claimed the NLM call
  was a POST; it never was. Search terms therefore do land in NLM's access
  logs and any intermediary between here and them. Part of the same
  privacy/legal decision as the BAA question above, not separable from it.
- What is sent is **not the user's full description**: it is at most three
  keywords extracted by `app/services/search_terms.py`, which cuts the text
  leaving the app substantially compared with sending the raw sentence.
- **Symptom-intake follow-up answers are in scope too.** Answers to the
  prompts in `app/core/followup.py` are merged into the description before
  the keyword extraction and the lookup, so elicited detail is covered by
  everything above, and the merged text is what `intake_assessments` stores.
- Validation errors are stripped of the submitted value before being
  returned (`app/main.py`), so a rejected query is not echoed back.



---

## Carried out of CLAUDE.md on 2026-09-19

*CLAUDE.md was still 90,636 characters after the first restructure — over the
limit, which means truncated, which means the fences at the bottom were not
reliably being read. The section below is that file's own text on this topic,
moved here verbatim. It may restate material already above it, because in
CLAUDE.md it was the summary of this document. Nothing was dropped; CLAUDE.md
now keeps the hard rules and points here.*

### Medical content: where it comes from


The app never authors medical content. All symptom and condition text is
fetched from **MedlinePlus** (NIH/NLM) through its public health-topics API.
Full reasoning, the retrieval rules and the measured accuracy:
`docs/medical-content.md`.

⛔ **Rules for anyone extending this:**

- **Render source text verbatim.** Do not summarise, paraphrase, shorten, or
  re-section it. Rewriting sourced material makes it app-authored medical
  content.
- **Do not extract "causes"** — or any other clinical category — out of a
  summary. A bulleted list in these topics is sometimes causes, sometimes
  symptoms, sometimes treatments; relabelling one as another invents a clinical
  claim. The source's own categories surface as "May be associated with".
- **Always carry attribution** (`source_name`) and the link back to the topic.
- **If the source is unavailable, show an error.** Never fall back to generated
  content.
- **A topic is shown only if a name the source gives it contains a word the
  user wrote** (`names_match` — its title, or one of NLM's own published
  `altTitle` synonyms, which are match input only and are never rendered).
  Non-matching topics are dropped, **never reordered**: ranking health topics
  by relevance would be a clinical judgement this app may not make.
- Free text is reduced to search terms (`app/services/search_terms.py`). This
  is **retrieval only** — it chooses which article to fetch and never alters
  the text shown. Three rules there exist because of measured wrong answers,
  not theory, and each is orthographic or positional rather than clinical:
  conversational scaffolding is filler, single words are tried
  **last-word-first**, and negations are kept but never searched alone.
  ⛔ Re-measure rather than reason about changes to it.

### ⛔ Related reading is gated off (`MEDLINEPLUS_TOPICS_ENABLED=false`)

Intake ships with reading material **switched off**, after a compliance review
found the known limit unacceptable to put in front of users: the filter is
lexical, so a context word that happens to name a topic still gets through —
"my head has been pounding" returns "Head and Neck Cancer", "nauseous after
eating" returns "Eating Disorders" — and a frightening, unrelated topic
rendered under a person's own description reads as a suggested diagnosis
regardless of the framing around it.

**Do not switch it on until a clinician has ruled on how topics are chosen.**

- While off, **no MedlinePlus request is made at all**, so no symptom text
  reaches NLM and that vendor's BAA question is moot for as long as it stays
  off.
- The retrieval code and its tests stay intact and exercised — the flag gates
  the call, not the code.
- A lexical tightening was tried and rejected: requiring more than a bare
  body-part word empties the good cases. Telling a location word from a symptom
  word is a semantic judgement, so the realistic fix is model-assisted topic
  selection — still retrieval, not authoring — which needs its own review.

