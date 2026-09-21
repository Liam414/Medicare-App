# Proposed red-flag phrases — for the owner and a clinician to rule on

Drafted 2026-09-20 from `scripts/triage_eval/phrasing_sweep.py`.

⛔ **NOTHING HERE HAS BEEN APPLIED.** `emergency.py` and `rules_triage.py` are
fenced by CLAUDE.md: an agent that believes a red-flag list needs changing must
stop and report it, leaving the code untouched. This file is that report, made
as useful as it can be — the specific phrases, grouped by the category they
belong to, so the conversation starts from a concrete list rather than from a
complaint.

## What the ask is

Each phrase below is a lay description of a presentation `emergency.py`
**already has a category and reviewed copy for**, which reaches no emergency
guidance today. Adding them changes no category, no headline, no action text
and no number — only which wordings match what is already written.

⛔ **This is a one-directional change.** Adding a phrase to `_EMERGENCY_RULES`
can only make screening *more* sensitive; it cannot make any current detection
stop working. That is the same argument `normalize_query`'s case-split and
`plural_tolerant` rest on, and it is why the fix is cheap **once somebody
qualified has read the list**.

## Why it matters more than the tier suggests

A miss on its own falls to URGENT — wrong, but safe. In the same sentence as an
ordinary complaint, the minor phrase matches positively and nothing escalates
it, so **61% of these come back SELF_CARE**: the app telling somebody their
problem will settle on its own. See `docs/test-run-2026-09-20.md`, FINDING 0.

## The questions for a clinician, not for us

1. Is each phrase below genuinely a description of its category? Anything that
   is not should be struck, not softened.
2. Are any of them **too broad** — would they fire for people who are not
   having an emergency often enough to teach users to ignore the guidance?
   ("out of breath" was deliberately excluded from an earlier pass for exactly
   this reason: it is what everyone says after stairs.)
3. Which of them, if any, are **missing** — wordings a real patient uses that
   an engineer would not think of?

## The list

### cardiac — 6 of 8 lay phrasings missed

- `my chest feels like an elephant is sitting on it`
- `my chest is being crushed`
- `a band is tightening around my chest`
- `my left arm has gone numb and my chest hurts`
- `burning in the middle of my chest and I feel sick`
- `my jaw and my arm ache and I feel clammy`

The first is, as far as an engineer can tell, the single most recognisable lay
description of a heart attack in English.

### breathing — 5 of 6 missed

- `my lips are turning blue`
- `I am wheezing and cannot speak a full sentence`
- `my inhaler is not touching it`
- `I am fighting to breathe`
- `I feel like I am suffocating`

Cyanosis has no phrase at all in the current list. "Cannot speak a full
sentence" is a standard severity marker in asthma guidance.

### stroke — 5 of 5 missed

- `half my face has gone slack`
- `my words are coming out as nonsense`
- `I cannot lift my right arm at all`
- `one side of me has gone dead`
- `I woke up and could not speak properly`

⛔ The first three are the three things a public stroke campaign teaches people
to say. None of them reaches the stroke category today.

### bleeding_trauma — 6 of 6 missed

- `blood is pouring from the cut and won't stop`
- `I threw up something that looked like coffee grounds`
- `blood is spurting out`
- `I am soaking through the bandage`
- `my stools are black and sticky`
- `I cannot stop the bleeding`

Coffee-ground emesis and black tarry stools are both textbook GI bleed
descriptions; the list has `threw up blood` and `black tarry stools`, which
these people never write.

### overdose_poisoning — 4 of 5 missed

- `I took the whole bottle of pills`
- `I swallowed a load of tablets`
- `my toddler drank the bleach`
- `he drank something from under the sink`

⛔ `I took too many pills` fires and reaches Poison Control. `I took the whole
bottle of pills` reaches nothing. These are the highest-stakes near-misses in
the set.

### vision_loss — 4 of 4 missed

- `it's like a curtain came down over one eye`
- `everything went black in my right eye`
- `I have lost the sight in one eye`
- `a shadow is covering half my vision`

`curtain came over my eye` was added 2026-09-14 and fires; inserting "down"
and "one" defeats it.

### anaphylaxis — 3 of 4 missed

- `my face is puffing up and I feel faint`
- `I used my epipen and still feel terrible`
- `my throat feels like it is closing`

"Used my epipen and still…" is arguably the most urgent sentence in this whole
document and matches nothing.

### consciousness — 3 of 5 missed

- `I keep passing in and out`
- `she will not wake up`
- `I went out cold`

### infant_fever — 2 of 3 missed

- `my newborn feels boiling and won't feed`
- `my three week old has a temperature`

### pregnancy — 2 of 3 missed

- `I am 30 weeks and have terrible stomach pain`
- `I am expecting and passing clots`

The pregnancy category's own copy already reads "Bleeding or severe abdominal
pain during pregnancy needs urgent assessment", so both are covered by text
that exists.

### self_harm — 1 of 4 missed

- `I want to end it all`

## ⛔⛔ THE MOST SERIOUS ONE, AND IT NEEDS NO CLINICAL JUDGEMENT AT ALL

**A suicidal statement written without a contraction, beside an ordinary
complaint, is answered with "this usually settles on its own."**

    "I don't want to be alive"                   -> EMERGENT, self_harm, 988
    "I do not want to be alive"                  -> URGENT, no guidance
    "a dry cough and I don't want to be alive"   -> EMERGENT, self_harm
    "a dry cough and I do not want to be alive"  -> SELF_CARE

**Eight red flags stop matching when their contraction is written out. Seven of
those eight become SELF_CARE beside a minor complaint:**

| phrase held | spelling that matches nothing | category |
|---|---|---|
| `don't want to be alive` | `do not want to be alive` | **self_harm** |
| `don't want to be here` | `do not want to be here` | **self_harm** |
| `can't get my words out` | `cannot get my words out` | stroke |
| `can't see` | `cannot see` | vision_loss |
| `can't catch my breath` | `cannot catch my breath` | breathing |
| `can't get enough air` | `cannot get enough air` | breathing |
| `can't close one eye` | `cannot close one eye` | stroke |
| `bleeding won't stop` | `bleeding will not stop` | bleeding_trauma |

`docs/test-run-2026-09-19.md` FINDING 1 already found this class and counted
the phrases, recording the cost as **EMERGENT → URGENT**. That understated it.
The lists carry `can't` **and** `cant` and never the expansion, so the third
way everybody writes it matches nothing — and beside a recognised minor
complaint the self-care phrase matches positively, nothing escalates it, and
the whole description comes back as reassurance.

### Why this is the first thing to do

⛔ **It requires no clinician.** Every other item in this document asks
somebody qualified to rule on whether a wording describes a presentation.
This one does not: these are wordings **the reviewed lists already hold**, in
the spelling nobody stored. Approving it adds no clinical claim.

⛔ **The repair is mechanical, and the pattern is already in the codebase.**
`plural_tolerant` generates a phrase's plural at compile time rather than
asking anyone to write both. The same shape applied to contractions —
generating the expansion alongside `can't` and `cant` — closes all eight at
once, and any added later, for free.

⛔ **It is one-directional**, like every other change proposed here: it adds
spellings to patterns that must already match in full, so it can make screening
more sensitive and cannot make it less.

Measured every run by `phrasing_sweep.py`.

## ⛔ A one-line change that is not a phrase at all, and may be the cheapest

**An invisible character inside a red flag defeats screening completely.**

    I have chest pain and I am sweating              -> cardiac, call 911
    I have chest<U+200B> pain and I am sweating      -> NOT SCREENED

Six characters do this, verified offline and reproduced against the live
deployment:

| character | what inserts it |
|---|---|
| U+200B ZERO WIDTH SPACE | web pages, rich-text editors |
| U+200C / U+200D ZERO WIDTH (NON-)JOINER | copied web text |
| U+FEFF ZERO WIDTH NO-BREAK SPACE | leads a file as a BOM |
| U+00AD SOFT HYPHEN | **Word, at a line break** |
| U+2060 WORD JOINER | typesetting, PDFs |

**Root cause, precisely.** `normalize_query` ends with `re.sub(r"\s+", " ")`.
Python's `\s` on a `str` pattern matches Unicode whitespace, so a non-breaking
space, a thin space and an ideographic space are all folded away and screening
works on them. These six are **category Cf (format)**, not whitespace, so
nothing touches them: the character sits inside the phrase, the word boundary
fails, and the description matches nothing at all.

**This is the same origin as the bug `normalize_query` already exists to fix.**
That one — a pasted symptom list arriving glued together — is documented as
"found from a real submission". Pasting from a web page, a PDF or an email is
exactly where these six come from. Somebody copying their symptoms out of a
message to their GP is the realistic case.

**Why it may be the cheapest fix available here.** It is one line, it needs no
clinical judgement at all — nobody has to rule on whether a wording describes a
condition — and it is one-directional in the same way the existing case-split
is: removing an invisible character can only make screening more sensitive and
can never make it less. It closes the gap for **every** phrase in every
category at once, rather than one wording at a time.

⛔ **Not applied.** CLAUDE.md records of the last edit to this very function
that it "landed only after the user approved it directly in conversation" and
that **"no agent may repeat this on its own authority."** Measured every run by
`phrasing_sweep.py`.

## The three mechanical fixes, together, and why they are one decision

Three of the items in this document need **no clinical judgement at all**,
because none of them adds a wording. Each makes spellings the reviewed lists
already hold reachable, and each is one-directional — it adds ways to match a
pattern that must still match in full, so screening can only become more
sensitive.

| | what misses today | fix |
|---|---|---|
| contractions | `do not want to be alive` | generate the expansion, as `plural_tolerant` generates plurals |
| invisible characters | `chest<U+200B> pain` | strip category-Cf characters in `normalize_query` |
| hyphens | `chest-pain`, `short-of-breath` | treat a hyphen as a space in `normalize_query` |

All three live in `normalize_query` or beside `plural_tolerant`, all three are
a few lines, and all three close their gap for **every phrase in every
category at once** rather than one wording at a time. Approving them as one
change is reasonable; approving the phrase list below is a separate, larger
question for somebody qualified.

### ⛔ Misspellings are NOT on this list, deliberately

`siezure`, `unconcious`, `sucidal thoughts` and `cant breath` all miss, and
they are reported rather than proposed.

Misspellings are an unbounded class. Closing them means fuzzy matching, and
that would trade the property this entire rule layer is built on — a
clinician can read a phrase list line by line and know what it does — for an
edit-distance threshold nobody can review and a false-positive rate nobody has
measured. The right answer is probably the licensed protocol content
`protocol_content.py` is already built to load, not a similarity score.

## Two separate items, already open

- **Contractions written out in full** (2026-09-19 FINDING 1): 36 reviewed
  phrases stop matching when a contraction is expanded, 8 of them dropping
  from EMERGENT. `I cannot catch my breath` is the one that combines with a
  self-care phrase to produce reassurance. Fixing that class is mechanical —
  generate the expansion alongside each contraction — and needs the same
  sign-off.
- **The all-caps glued list**: `CHEST PAINSHORTNESS OF BREATH` has no case
  boundary for `normalize_query` to split on.

## How to apply, once approved

Per CLAUDE.md: add the phrase to the right list in `_EMERGENCY_RULES`, add a
test, and remember the lists are lay language. Then move the matching cases out
of `_DOCUMENTED_GAPS` in `scripts/triage_eval/corpus.py` and out of
`FALSE_SELF_CARE` / `PHRASINGS` in `phrasing_sweep.py`, so the fix is measured
rather than asserted — a case moving out of those sections is the evidence.

⛔ **A clinician should read this list before any of it is added**, and the
record of their sign-off belongs in CLAUDE.md alongside the other approvals.
