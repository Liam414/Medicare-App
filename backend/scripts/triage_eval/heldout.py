"""
Two probe sets written 2026-09-22, and the rule that separates them.

SYNTHETIC ONLY, like every corpus in this directory. Gold labels are this
app's own documented intent, assigned by a software engineer: an EMERGENT
label is only given where `emergency.py` ALREADY defines a category covering
the description (`screening intent: X`). Not clinical validation.

## Why there are two

The 122-case and 11,272-case corpora both score 100%, and both were written
alongside the phrase lists they measure. A 55-case probe written without
looking at those lists caught 5 of 39 emergencies (13%). That gap is the
finding: a corpus its author tunes against measures the author's memory of
the lists, not the lists.

- **`TUNING`** is that 55-case probe (set A). The phrase additions of
  2026-09-22 were made by reading its misses. It is in-sample from now on and
  its score says nothing about unseen phrasing.
- ⛔ **`HELDOUT`** (set B) was written and frozen BEFORE any phrase was added,
  by the same engineer, without running it. **Never add a phrase because a
  HELDOUT case missed.** The moment you do, it becomes a second TUNING set and
  the app has no honest number again. Write a new set instead, freeze it, and
  move this one into TUNING. `measure_heldout.py` reports it; the ratchet in
  `tests/test_triage_heldout.py` only stops it getting worse.

Same author for both sets, so B is "unseen phrasing", not "independent". A set
written by someone who has never read this repository is still the missing
measurement.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "triage_eval_corpus_types", Path(__file__).with_name("corpus.py")
)
_corpus = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_corpus)
Case = _corpus.Case

E, U, S = "EMERGENT", "URGENT", "SELF_CARE"


def _c(gold: str, basis: str, text: str) -> "Case":
    return Case(description=text, gold=gold, basis=basis, natural=True)


# Set A. The misses here were read, and phrases were added for them.
TUNING: list = [
    _c(E, "screening intent: cardiac", "chest pian and my left arm is numb"),
    _c(E, "screening intent: cardiac", "feels like an elephant sitting on my chest"),
    _c(E, "screening intent: cardiac", "my chest hurts really bad and im sweating"),
    _c(E, "screening intent: cardiac", "squeezing in my chest going into my jaw"),
    _c(E, "screening intent: breathing", "he's not breathing"),
    _c(E, "screening intent: breathing", "my lips are turning blue"),
    _c(E, "screening intent: breathing", "cant breath"),
    _c(E, "screening intent: breathing", "wheezing so bad i cant talk in full sentences"),
    _c(E, "screening intent: breathing", "gasping for air"),
    _c(E, "screening intent: stroke", "my dad's speech is slurred and one side of his face looks weird"),
    _c(E, "screening intent: stroke", "suddenly cant lift my right arm"),
    _c(E, "screening intent: stroke", "thunderclap headache"),
    _c(E, "screening intent: stroke", "words are coming out wrong and my hand is numb"),
    _c(E, "screening intent: bleeding_trauma", "cut my hand and it wont stop bleeding"),
    _c(E, "screening intent: bleeding_trauma", "blood is spurting from the cut"),
    _c(E, "screening intent: bleeding_trauma", "he fell off the ladder and can't move his legs"),
    _c(E, "screening intent: bleeding_trauma", "car accident and my neck hurts bad"),
    _c(E, "screening intent: anaphylaxis", "ate peanuts and my face is swelling up"),
    _c(E, "screening intent: anaphylaxis", "bee sting and my throat feels tight"),
    _c(E, "screening intent: consciousness", "she won't wake up"),
    _c(E, "screening intent: consciousness", "he is having a fit and shaking all over"),
    _c(E, "screening intent: consciousness", "my heart is racing and i feel like ill pass out"),
    _c(E, "screening intent: self_harm", "i wanna kms"),
    _c(E, "screening intent: self_harm", "i dont want to live anymore"),
    _c(E, "screening intent: self_harm", "thinking of ending it all"),
    _c(E, "screening intent: self_harm", "everyone would be better off without me"),
    _c(E, "screening intent: vision_loss", "everything went black in one eye"),
    _c(E, "screening intent: vision_loss", "suddenly seeing double and dizzy"),
    _c(E, "screening intent: sepsis_meningitis", "purple spots that dont go away when i press a glass on them"),
    _c(E, "screening intent: infant_fever", "my baby is 6 weeks old and has a temp of 100.8"),
    _c(E, "screening intent: infant_fever", "2 month old running a fever"),
    _c(E, "screening intent: pregnancy", "I'm pregnant and my water broke at 30 weeks"),
    _c(E, "screening intent: pregnancy", "34 weeks pregnant with a bad headache and blurry vision"),
    _c(E, "screening intent: pregnancy", "heavy bleeding at 12 weeks pregnant"),
    _c(E, "screening intent: overdose_poisoning", "I took 20 tylenol"),
    _c(E, "screening intent: overdose_poisoning", "I've been drinking and took my xanax"),
    _c(E, "screening intent: overdose_poisoning", "my kid got into the dishwasher pods"),
    _c(E, "screening intent: overdose_poisoning", "toddler drank some of the cleaning spray"),
    _c(E, "screening intent: overdose_poisoning", "took way too many of my sleeping pills"),
    _c(U, "urgent rule: fever_with_duration", "sore throat and fever for 5 days"),
    _c(U, "urgent rule: possible_fracture", "twisted my ankle and cant put weight on it"),
    _c(U, "urgent rule: infection_signs", "burning when I pee and back pain"),
    _c(U, "urgent rule: medication_reaction", "rash spreading after starting new antibiotic"),
    _c(U, "urgent rule: cannot_keep_fluids_down", "been throwing up all day and cant keep water down"),
    _c(U, "safe default", "ear pain and drainage for 3 days"),
    _c(U, "urgent rule: wound_needs_review", "deep cut on my finger might need stitches"),
    _c(U, "urgent rule: new_lump_or_unexplained_change", "lump in my breast i just noticed"),
    _c(S, "self-care list", "I have a cold"),
    _c(S, "self-care list", "runny nose and sneezing"),
    _c(S, "self-care list", "a few mosquito bites that itch"),
    _c(S, "self-care list", "mild headache after a long day"),
    _c(S, "self-care list", "got a small paper cut"),
    _c(S, "self-care list", "stuffy nose and scratchy throat"),
    _c(S, "self-care list", "bit of heartburn after pizza"),
    _c(S, "self-care list", "I have dandruff"),
]


# ⛔ Set B. Frozen 2026-09-22 before any phrase was added. Never tune to it.
HELDOUT: list = [
    _c(E, "screening intent: cardiac", "tight band across my chest and my left arm aches"),
    _c(E, "screening intent: cardiac", "crushing feeling behind my breastbone"),
    _c(E, "screening intent: cardiac", "chest discomfort spreading to my back and I feel sick"),
    _c(E, "screening intent: cardiac", "my chest is killing me"),
    _c(E, "screening intent: breathing", "i can barely breathe"),
    _c(E, "screening intent: breathing", "struggling to get air in"),
    _c(E, "screening intent: breathing", "my son is breathing really fast and his ribs are sucking in"),
    _c(E, "screening intent: breathing", "choking and cant get it out"),
    _c(E, "screening intent: stroke", "half my face went numb all of a sudden"),
    _c(E, "screening intent: stroke", "my mom cant find her words and her arm is weak"),
    _c(E, "screening intent: stroke", "sudden terrible headache like being hit with a bat"),
    _c(E, "screening intent: stroke", "one side of my body feels weak"),
    _c(E, "screening intent: bleeding_trauma", "bleeding through the towel and it wont stop"),
    _c(E, "screening intent: bleeding_trauma", "got stabbed"),
    _c(E, "screening intent: bleeding_trauma", "fell down the stairs and hit my head now im confused"),
    _c(E, "screening intent: bleeding_trauma", "coughing up blood"),
    _c(E, "screening intent: anaphylaxis", "my tongue feels huge after eating shrimp"),
    _c(E, "screening intent: anaphylaxis", "hives all over and my throat is getting tight"),
    _c(E, "screening intent: anaphylaxis", "allergic reaction and i used my epipen"),
    _c(E, "screening intent: consciousness", "my grandpa is unresponsive"),
    _c(E, "screening intent: consciousness", "she keeps passing in and out"),
    _c(E, "screening intent: consciousness", "my kid had a seizure for the first time"),
    _c(E, "screening intent: self_harm", "i want to end my life"),
    _c(E, "screening intent: self_harm", "i have a plan to kill myself tonight"),
    _c(E, "screening intent: self_harm", "i keep thinking about suicide"),
    _c(E, "screening intent: self_harm", "i just want to disappear forever"),
    _c(E, "screening intent: vision_loss", "i suddenly cant see out of my right eye"),
    _c(E, "screening intent: vision_loss", "my vision went dark in one eye for a few minutes"),
    _c(E, "screening intent: sepsis_meningitis", "fever and a rash that won't fade and my neck is stiff"),
    _c(E, "screening intent: sepsis_meningitis", "high fever and im really confused"),
    _c(E, "screening intent: infant_fever", "my newborn has a fever"),
    _c(E, "screening intent: infant_fever", "8 week old baby with a temperature of 101"),
    _c(E, "screening intent: pregnancy", "pregnant and having really bad stomach pain"),
    _c(E, "screening intent: pregnancy", "i'm 8 months pregnant and the baby stopped moving"),
    _c(E, "screening intent: pregnancy", "bleeding a lot and i'm pregnant"),
    _c(E, "screening intent: overdose_poisoning", "i swallowed a whole bottle of pills"),
    _c(E, "screening intent: overdose_poisoning", "my toddler ate some of my blood pressure pills"),
    _c(E, "screening intent: overdose_poisoning", "accidentally took a double dose of my insulin"),
    _c(E, "screening intent: overdose_poisoning", "kid drank bleach"),
    _c(U, "urgent rule: fever_with_duration", "fever for 4 days that wont go away"),
    _c(U, "urgent rule: persistent_or_worsening", "cough for 3 weeks"),
    _c(U, "urgent rule: persistent_or_worsening", "headache every day for 2 weeks"),
    _c(U, "urgent rule: possible_fracture", "fell on my wrist and its swollen and bent"),
    _c(U, "urgent rule: infection_signs", "red hot swollen spot on my leg that's spreading"),
    _c(U, "urgent rule: eye_symptoms", "my eye is red and painful and light hurts"),
    _c(U, "urgent rule: cannot_keep_fluids_down", "can't keep anything down since yesterday"),
    _c(U, "urgent rule: medication_reaction", "started a new pill and now my lips are itchy"),
    _c(U, "safe default", "pain in my side that comes and goes"),
    _c(S, "self-care list", "just a runny nose"),
    _c(S, "self-care list", "sore throat since this morning"),
    _c(S, "self-care list", "i have the sniffles"),
    _c(S, "self-care list", "mild sunburn on my shoulders"),
    _c(S, "self-care list", "my lips are chapped"),
    _c(S, "self-care list", "small bruise on my knee from bumping the table"),
]
