# Medication label scanning (implemented)

*Moved out of `CLAUDE.md` on 2026-09-19, verbatim, to bring that file back under its size limit. Nothing here was rewritten or dropped. `CLAUDE.md` keeps the rules a reader must not miss and points here for the reasoning.*


A user can photograph a prescription label instead of typing the medication in.
Manual entry is unchanged and remains the primary path.

**The OCR runs on the device.** Apple Vision on iOS, Google ML Kit Text
Recognition v2 on Android, both via `expo-mlkit-ocr`. This was a data-handling
decision before it was an engineering one:

- A prescription label carries the patient's name, address, prescriber,
  pharmacy, Rx number, drug and dose **in one photograph**. It is about the
  most identifying artefact a user could hand this app.
- Sending it to a cloud OCR service (Google Cloud Vision, AWS Textract, Azure
  AI Vision) would make that vendor a processor of PHI and require a signed
  BAA. All three will sign one; **this project has none with anyone**, and
  procuring one is a legal decision, not an engineering one.
- On-device recognition means **no BAA question arises at all**: no image and
  no recognised text leaves the phone. `app/services/labelScanner.ts` makes no
  network call, which is a property you can verify by reading it, and a test
  asserts `fetch` is never called during a read.
- The cost is accuracy on hard photographs — curled labels on round bottles,
  low light, worn thermal print. Cloud OCR is better at those. That is the
  trade, and it is why every read is confirmed by the user rather than trusted.
- It needs a **development build**; `expo-mlkit-ocr` does not run in Expo Go.
  When the native module is absent the feature reports itself unavailable and
  the user is sent to manual entry.

### Two engines, one parser

Recognition is platform-split; everything above it is shared.

| | Engine | Network |
|---|---|---|
| `labelScanner.ts` (iOS/Android) | Apple Vision / ML Kit v2 | **none at all** |
| `labelScanner.web.ts` (browser) | Tesseract (WebAssembly) | fetches its model |

Metro resolves the `.web.ts` variant automatically. Both expose the same
functions, throw the same `ScanError`s from `scanErrors.ts`, and return the
same `ParsedLabel` from the same parser, so a label reads identically wherever
it is scanned and `MedicationScanScreen` needs no platform knowledge.

The web engine exists because a browser cannot reach Apple Vision or ML Kit —
they are OS frameworks. It is what makes scanning work on an iPhone through
Safari with no App Store, no development build and no Apple Developer account.

**State the privacy property precisely, because it differs.** On both paths the
photograph never leaves the device: it is handed straight to on-device code and
the recognised text is discarded after parsing. But the native path makes *no
network call whatsoever*, while Tesseract downloads its WASM core and English
training data from a CDN on first use. What travels is the model coming down,
never the image going up — so no PHI is transmitted and no BAA question arises
— but do not copy "makes no network call" onto the web file. If even the model
fetch becomes unacceptable, the assets can be self-hosted by pointing
`workerPath`/`corePath`/`langPath` at our own origin; that is a deployment
change, not a code change.

Tesseract is meaningfully worse than the native engines on curled, dim or worn
labels. Since every read is confirmed by the user before saving, a weaker
engine costs accuracy and patience, not safety.

Rules for anyone extending this:

- **Nothing scanned is ever saved without the user confirming it on screen.**
  The scan screen cannot write a medication; every path out of it opens the
  ordinary form, prefilled, and the user presses the same save button as
  someone who typed it in. A misread dose that saved itself would change when
  a person takes a medication with nobody having looked at it. Tests assert
  this on both screens.
- **Directions are carried across verbatim.** `labelParser.ts` copies the sig
  line as printed and does not expand BID/TID/QHS or reword anything.
  Decoding an abbreviation into dosing instructions would be app-authored
  clinical content, and a wrong expansion changes medication timing. Same rule
  as the MedlinePlus verbatim requirement above.
- **Doses are never restated or converted.** "250 mg/5 mL" stays a
  concentration. Only spacing and unit capitalisation are tidied.
- **Drug names are never corrected against a dictionary.** A misread name
  stays misread so the user can see it is wrong. Snapping OCR output to the
  nearest real drug turns a legible mistake into a plausible one.
- **Only the four fields the form already stores are extracted.** The
  patient's name, address and Rx number are deliberately not read out — the
  app has no field for them, and the raw OCR text is discarded inside
  `readLabel` rather than returned to any screen.
- A failed or low-confidence read **falls back to manual entry with whatever
  was extracted prefilled**, never to a dead end.
- Parser accuracy is measured over **whole labels**, not one string at a time
  (`mobile/__tests__/labelParserCorpus.test.ts`, synthetic layouts only). Two
  defects it found, both of which corrupted a field rather than failing to
  read it:
  - `"100 UNITS/ML"` came back as a dosage of `"100 units"` and a drug name of
    `"Insulin Glargine ML"`. The strength pattern required a number after the
    slash, and a concentration printed per one millilitre does not write the
    1 — so the denominator was dropped from the dose and the orphaned `/ML`
    was read as part of the name. Dropping a denominator restates a dose,
    which is the thing this parser is forbidden to do.
  - `"LISINOPRIL-HCTZ"` came back as `"Lisinopril-Hctz"`. De-shouting block
    capitals treated any all-caps run over three letters as a word; an
    all-caps token with no vowel is now left as printed, so `HCL`, `HCTZ` and
    `SMZ` survive.

  Neither fix reads a dictionary or asks what any letters stand for. The
  corpus tests layout, not recognition — OCR quality belongs to the engine and
  cannot be measured without real photographs.

Not yet reviewed by a clinician or by counsel. Scanning does not estimate
urgency and authors no clinical content, so it is not covered by the intake
blocker below — but the parsing heuristics have only been tested against
synthetic labels written by an engineer, not against a corpus of real ones.

