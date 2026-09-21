"""
Tests for emergency red-flag screening.

These matter more than most: a miss here means someone describing a heart
attack is shown reading material instead of being told to call 911.
"""

import pytest

from app.core.emergency import screen_for_emergency


@pytest.mark.parametrize(
    "query,expected_category",
    [
        ("chest pain", "cardiac"),
        ("crushing chest pressure", "cardiac"),
        ("I think I'm having a heart attack", "cardiac"),
        ("difficulty breathing", "breathing"),
        ("can't breathe", "breathing"),
        ("shortness of breath", "breathing"),
        ("face drooping and slurred speech", "stroke"),
        ("worst headache of my life", "stroke"),
        ("severe bleeding", "bleeding_trauma"),
        ("coughing up blood", "bleeding_trauma"),
        ("throat closing", "anaphylaxis"),
        ("severe allergic reaction", "anaphylaxis"),
        ("having a seizure", "consciousness"),
        ("unresponsive", "consciousness"),
        ("suicidal", "self_harm"),
        ("I want to die", "self_harm"),
        ("took too many pills", "overdose_poisoning"),
    ],
)
def test_emergency_language_is_detected(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None, f"no emergency guidance for {query!r}"
    assert guidance.category == expected_category
    assert guidance.matched_terms


@pytest.mark.parametrize(
    "query",
    [
        "can’t breathe",  # iOS curly apostrophe
        "bleeding won’t stop",
        "I can‘t breathe",  # left single quote
    ],
)
def test_smart_apostrophes_still_match(query):
    # iOS substitutes a curly apostrophe as the user types, so matching the
    # ASCII form literally would miss these on the primary target platform.
    assert screen_for_emergency(query) is not None


def test_extra_whitespace_does_not_defeat_matching():
    assert screen_for_emergency("chest    pain") is not None


@pytest.mark.parametrize(
    "query,expected_category",
    [
        ("sudden vision loss", "vision_loss"),
        ("stiff neck and fever", "sepsis_meningitis"),
        ("baby has a fever", "infant_fever"),
        ("bleeding while pregnant", "pregnancy"),
    ],
)
def test_additional_red_flag_categories(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None
    assert guidance.category == expected_category


@pytest.mark.parametrize(
    "query,expected_category",
    [
        # A user writes "my X is Y-ing", not the gerund-noun phrase the
        # original lists matched literally. Found via ad-hoc testing against
        # common illness descriptions: real anaphylaxis/breathing/vision-loss
        # phrasing was falling through to no match at all.
        ("my throat is closing and my tongue is swelling", "anaphylaxis"),
        ("my lips are swelling up", "anaphylaxis"),
        ("chest feels tight and it hurts", "cardiac"),
        ("I am having a hard time breathing", "breathing"),
        ("I can't catch my breath", "breathing"),
        ("I suddenly lost vision in my left eye", "vision_loss"),
        ("stiff neck with a fever", "sepsis_meningitis"),
    ],
)
def test_natural_phrasing_variants_are_detected(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None, f"no emergency guidance for {query!r}"
    assert guidance.category == expected_category


def test_no_guidance_instructs_administering_a_treatment():
    # An earlier draft told users to use an epinephrine auto-injector. Giving
    # drug-administration instructions is treatment advice this app must not
    # provide, whatever the situation.
    import re

    from app.core.emergency import _EMERGENCY_RULES

    # Whole words only — "dose" must not match inside "overdose", which is a
    # legitimate word for naming the situation rather than advising a remedy.
    banned = ("auto-injector", "epinephrine", "swallow", "apply", "dose", "medication")
    for _category, headline, action, _phrases in _EMERGENCY_RULES:
        text = f"{headline} {action}".lower()
        for term in banned:
            assert not re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text), (
                f"{term!r} appears in emergency copy: {text}"
            )


def test_detection_is_case_insensitive():
    assert screen_for_emergency("CHEST PAIN") is not None
    assert screen_for_emergency("Chest Pain") is not None


def test_detection_survives_surrounding_words_and_punctuation():
    assert screen_for_emergency("sudden chest pain, help!") is not None
    assert screen_for_emergency("my dad has trouble breathing") is not None


def test_self_harm_guidance_points_to_a_crisis_line_not_the_app():
    guidance = screen_for_emergency("suicidal thoughts")

    assert guidance is not None
    assert "988" in guidance.action


@pytest.mark.parametrize(
    "query", ["chest pain", "stroke", "anaphylaxis", "overdose", "suicidal"]
)
def test_emergency_guidance_routes_to_help_without_asserting_a_diagnosis(query):
    # Conditional phrasing ("if you have chest pain, call 911") is correct and
    # expected. What must never appear is the app telling someone what they
    # have or what to take.
    guidance = screen_for_emergency(query)
    assert guidance is not None

    text = f"{guidance.headline} {guidance.action}".lower()

    for asserted_diagnosis in (
        "you are having a",
        "you have had a",
        "this is a heart attack",
        "you are having a stroke",
        "diagnos",
    ):
        assert asserted_diagnosis not in text

    # And it must always give a way to reach real help.
    assert "911" in text or "988" in text


@pytest.mark.parametrize(
    "query",
    [
        "sore throat",
        "seasonal allergies",
        "vitamin d",
        "knee pain",
        "heartburn",
    ],
)
def test_ordinary_searches_do_not_trigger_emergency_guidance(query):
    assert screen_for_emergency(query) is None


def test_blank_query_returns_nothing():
    assert screen_for_emergency("") is None
    assert screen_for_emergency("   ") is None


# ---------------------------------------------------------------------------
# FIXED, with explicit human approval (2026-09-01). Regression tests below.
#
# Red-flag screening is defeated when two lines of a list arrive with no
# separator between them. "Chest pain" and "Shortness of breath" as separate
# list items become "Chest painShortness of breath", and the word boundaries
# in `_compile` mean NOTHING matches: not chest pain, not shortness of breath.
# The description is then unrecognised, so it takes the URGENT default rather
# than EMERGENT, and the user is not told to call 911.
#
# This was found from a real submission in the dev log, where a pasted list of
# cold symptoms arrived as "Runny or stuffy noseScratchy or sore throatMild
# cough". That one was harmless. The same glue on a cardiac description is not.
#
# THE FIX IS ONE LINE, in `normalize_query`: insert a space at a lowercase-to-
# uppercase boundary, so "painShortness" becomes "pain Shortness" before any
# matching happens. It can only ever make screening MORE sensitive — it splits
# words apart, it never joins them — so it cannot cause a miss.
#
# `app/core/emergency.py` is fenced by CLAUDE.md. The fix was applied only
# after the user approved it directly, which is the "explicit human approval
# obtained outside of this pipeline" that fence requires. These tests now
# guard it: if the split is ever removed, they fail rather than going quiet.
# ---------------------------------------------------------------------------

GLUED_RED_FLAGS = [
    ("cardiac", "Chest painShortness of breath"),
    ("stroke", "Sudden numbnessTrouble speaking"),
    ("bleeding", "Severe bleedingDizziness"),
]


@pytest.mark.parametrize("category, description", GLUED_RED_FLAGS)
def test_the_same_words_are_screened_when_separated(category, description):
    """Control: with a separator, every one of these is caught today."""
    spaced = description.replace("pain", "pain ").replace("numbness", "numbness ")
    spaced = spaced.replace("bleeding", "bleeding ")

    assert screen_for_emergency(spaced) is not None


@pytest.mark.parametrize("category, description", GLUED_RED_FLAGS)
def test_glued_list_items_are_still_screened(category, description):
    assert screen_for_emergency(description) is not None


# ---------------------------------------------------------------------------
# Two-term red flags, caught by the concept combinator.
#
# The `sepsis_meningitis` action text has always named three combinations —
# "A stiff neck with fever, a rash that does not fade when pressed, or
# confusion with a high fever" — but the phrase list could only detect each
# one written as a single contiguous string, so the ordinary way of writing
# it ("my neck is stiff and I have a fever") matched nothing and fell to the
# URGENT default. That limit was recorded in this module against itself.
#
# `app/core/symptom_concepts.py` closes it, consulted at the end of
# `screen_for_emergency` AFTER every literal phrase has been tried — so it can
# only turn a `None` into guidance, never change a category. The full set of
# structural guarantees is tested in `test_symptom_concepts.py`; these are the
# regression cases for the screening behaviour itself.
# ---------------------------------------------------------------------------

TWO_TERM_RED_FLAGS = [
    "my neck is stiff and I have a fever",
    "I have a fever and my neck has gone stiff",
    "burning up and I can't turn my neck",
    "I have a rash and it doesn't fade when I press it",
    "he is confused and has a really high temperature",
]


@pytest.mark.parametrize("description", TWO_TERM_RED_FLAGS)
def test_two_term_red_flags_are_screened(description):
    guidance = screen_for_emergency(description)

    assert guidance is not None, f"no emergency guidance for {description!r}"
    assert guidance.category == "sepsis_meningitis"


@pytest.mark.parametrize(
    "description",
    [
        "my neck is stiff",
        "I have a fever",
        "a rash on my arm",
        "I feel confused",
    ],
)
def test_one_half_of_a_two_term_flag_is_not_enough(description):
    """A combination is an AND. Half of one must not fire it."""
    assert screen_for_emergency(description) is None


class TestTheCaseSplitCannotBreakAPhrase:
    """
    ⛔ THE PRECONDITION THAT MAKES `normalize_query` ONE-DIRECTIONAL.

    `normalize_query` inserts a space at every lowercase-to-uppercase boundary
    so a pasted list — "Chest painShortness of breath" — is split before
    matching. The module argues this is safe in one direction: "it only ever
    inserts a space, so it can make screening more sensitive and can never make
    it less."

    That argument is sound **only while no phrase in the lists contains such a
    boundary itself**. A phrase written "chestPain", or any phrase with an
    internal capital, would be split down the middle by the very normalisation
    meant to help it, and would then match nothing.

    Checked: all 212 phrases, zero contain one. So the guarantee holds today —
    and this keeps it holding, because the day somebody adds `McBurney` or
    `ePainScore` to a list the argument quietly stops being true and nothing
    else would notice.

    ⛔ It is a precondition test, not a behaviour test. It does not check that
    the split works; `test_emergency.py` already covers that. It checks that
    the reason the split is safe is still the case.
    """

    def test_no_phrase_contains_a_lowercase_to_uppercase_boundary(self):
        import re

        from app.core import emergency

        boundary = re.compile(r"(?<=[a-z])(?=[A-Z])")
        offenders = [
            (rule[0], phrase)
            for rule in emergency._EMERGENCY_RULES
            for phrase in rule[3]
            if boundary.search(phrase)
        ]

        assert offenders == [], (
            "these phrases would be split in half by normalize_query's own "
            f"case-split, and would then match nothing: {offenders}"
        )


class TestThePluralRuleHoldsForEveryPhrase:
    """
    ⛔ `plural_tolerant` GENERALISES, AND NOW SOMETHING SAYS SO.

    The 2026-09-14 fix was found from five broken plurals — chest pains,
    seizures, head injuries, overdoses, strokes — and is tested on exactly
    those five. That is the shape of coverage this repository keeps finding
    wanting: correct on the examples it was written from, silent about the
    rule.

    Measured across all 212 phrases in `_EMERGENCY_RULES`: 211 can be
    meaningfully pluralised and **all 211 still match**. So the rule does hold
    generally, and this asserts it rather than leaving it to five examples and
    a hope.

    What it protects: `plural_tolerant` appends optional trailing characters to
    a pattern. A future change to how phrases are compiled — a stricter
    boundary, an escape, a word-boundary guard put back — could quietly undo it
    for some phrases and not the five that are named elsewhere. "I am getting
    chest pains" returning nothing is the failure this whole rule exists to
    prevent, and it was live once.

    ⛔ Adds nothing to `emergency.py` and changes nothing in it.
    """

    @staticmethod
    def _pluralise(phrase: str) -> str | None:
        """The ordinary English plural of the phrase's last word."""
        head, _, last = phrase.rpartition(" ")
        word = last or phrase
        if not word.isalpha():
            return None
        if word.endswith(("s", "x", "z", "ch", "sh")):
            plural = word + "es"
        elif word.endswith("y") and len(word) > 1 and word[-2] not in "aeiou":
            plural = word[:-1] + "ies"
        else:
            plural = word + "s"
        return f"{head} {plural}".strip() if head else plural

    def test_every_phrase_still_matches_in_the_plural(self):
        from app.core import emergency

        lost: list[tuple[str, str]] = []
        checked = 0

        for rule in emergency._EMERGENCY_RULES:
            for phrase in rule[3]:
                plural = self._pluralise(phrase)
                if plural is None or plural == phrase:
                    continue
                checked += 1
                if screen_for_emergency(phrase) and not screen_for_emergency(plural):
                    lost.append((phrase, plural))

        # Guards against the assertion passing because nothing was checked —
        # a rename of the rule tuple's shape would otherwise make this vacuous.
        assert checked > 150, f"only {checked} phrases were pluralised"
        assert lost == [], (
            f"these lose their red flag in the plural: {lost[:10]}"
        )


class TestEveryCategoryGivesAWayToGetHelp:
    """
    ⛔ THE HIGHEST-CONSEQUENCE LITERALS IN THE APPLICATION.

    A red flag whose guidance names no number tells somebody they are having an
    emergency and leaves them there. A red flag whose guidance names the WRONG
    number is worse: it sends them somewhere while they believe they are being
    helped.

    Until now only self-harm's 988 was asserted. Poison Control's number was in
    no test at all, and nothing checked that a category still carried a number
    after its copy was edited — so `988` mistyped as `998`, or a number dropped
    while rewording an action line, passed the whole suite.

    ⛔ These tests add nothing to `emergency.py` and change nothing in it.
    CLAUDE.md permits exactly this: "Adding tests for those modules is
    permitted; changing the modules is not."

    The numbers, and why each is the one it is:

      911            US emergency services.
      988            the Suicide & Crisis Lifeline. Three digits, and one
                     wrong digit reaches something else entirely.
      1-800-222-1222 Poison Control, US. The single national number.
    """

    EMERGENCY = "911"
    CRISIS_LINE = "988"
    POISON_CONTROL = "1-800-222-1222"

    def _rules(self):
        from app.core import emergency

        return emergency._EMERGENCY_RULES

    def test_every_category_names_a_number_to_ring(self):
        import re

        from app.core import emergency

        pattern = re.compile(
            rf"\b{self.EMERGENCY}\b|\b{self.CRISIS_LINE}\b|{re.escape(self.POISON_CONTROL)}"
        )
        silent = [
            rule[0]
            for rule in emergency._EMERGENCY_RULES
            if not pattern.search(f"{rule[1]} {rule[2]}")
        ]

        assert silent == [], (
            f"these categories tell somebody it is an emergency and give them "
            f"no number: {silent}"
        )

    def test_the_crisis_line_is_988_exactly(self):
        """
        Pinned as a literal, because a transposition is invisible on reading.
        998, 899 and 989 are all plausible slips and none of them is a
        lifeline.
        """
        guidance = screen_for_emergency("I have been thinking about hurting myself")

        assert guidance is not None
        assert self.CRISIS_LINE in guidance.action
        assert "Suicide" in guidance.action or "Crisis" in guidance.action

    def test_poison_control_is_the_national_number(self):
        """
        Was in no test at all. The US has one national Poison Control number
        and this is it; a wrong one reaches nobody who can help.
        """
        guidance = screen_for_emergency("I took too many pills")

        assert guidance is not None
        assert self.POISON_CONTROL in guidance.action

    def test_no_category_offers_only_a_crisis_line(self):
        """
        ⛔ 988 is an addition to 911, never a replacement.

        Somebody describing self-harm may also be in immediate physical
        danger, and a lifeline is not an ambulance. The self-harm copy names
        both today; this keeps it that way.
        """
        from app.core import emergency

        for rule in emergency._EMERGENCY_RULES:
            text = f"{rule[1]} {rule[2]}"
            if self.CRISIS_LINE in text:
                assert self.EMERGENCY in text, (
                    f"{rule[0]} offers {self.CRISIS_LINE} without "
                    f"{self.EMERGENCY}"
                )

    def test_the_guidance_never_names_a_condition_or_a_treatment(self):
        """
        App Scope, applied to the copy people are most likely to act on.

        `emergency.py` says it "never names a condition or a treatment". The
        categories are named for presentations, and the action lines say how to
        get help — they must not start saying what is wrong or what to take.
        """
        from app.core import emergency

        # ⛔ "you have" IS DELIBERATELY NOT ON THIS LIST, AND THE REASON IS
        # WORTH KEEPING. It was, and it flagged the cardiac headline — "If you
        # have chest pain, call 911 now." That is naming the SYMPTOM the person
        # just reported, not a condition, and the check was wrong rather than
        # the copy.
        #
        # It is the same blunt-phrase-list mistake this repository keeps
        # finding elsewhere, made here by a test rather than by the app. A
        # denylist that flags correct copy gets a reviewer into the habit of
        # overriding it, which is worse than not having it.
        #
        # What remains is diagnostic or prescriptive in any context.
        forbidden = (
            "diagnos",
            "you probably have",
            "this is likely",
            "take ibuprofen",
            "take aspirin",
            "take an antihistamine",
            "you should take",
            "sounds like a",
        )
        offenders = []
        for rule in emergency._EMERGENCY_RULES:
            text = f"{rule[1]} {rule[2]}".lower()
            for phrase in forbidden:
                if phrase in text:
                    offenders.append((rule[0], phrase))

        assert offenders == [], offenders
