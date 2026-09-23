"""
Tests for the rule-based classifier.

The property under test throughout: SELF_CARE must be positively earned.
Anything unrecognised, ambiguous, or modified resolves to URGENT.

All descriptions are synthetic.
"""

import pytest

from app.core.rules_triage import classify


class TestEmergentTakesPrecedence:
    @pytest.mark.parametrize(
        "description",
        [
            "I have crushing chest pain",
            "I can't breathe properly",
            "my face is drooping and my speech is slurred",
            "I want to end my life",
        ],
    )
    def test_red_flags_classify_as_emergent(self, description):
        result = classify(description)

        assert result.tier_name == "EMERGENT"
        assert result.emergency is not None

    def test_a_red_flag_beats_a_self_care_phrase_in_the_same_sentence(self):
        # Someone can mention both; the dangerous one must win.
        result = classify("I have a sore throat and also chest pain")

        assert result.tier_name == "EMERGENT"


class TestUrgentRules:
    @pytest.mark.parametrize(
        "description,expected_rule",
        [
            ("I think I broke my wrist", "possible_fracture"),
            ("I can't put weight on my ankle", "possible_fracture"),
            ("deep cut on my hand", "wound_needs_review"),
            ("a dog bite on my leg", "wound_needs_review"),
            ("there are red streaks around the wound", "infection_signs"),
            ("this rash keeps getting worse", "persistent_or_worsening"),
            ("I've had a high fever", "fever_with_duration"),
            ("I can't keep anything down", "cannot_keep_fluids_down"),
            ("something in my eye", "eye_symptoms"),
            ("I found a lump on my neck", "new_lump_or_unexplained_change"),
            ("I'm pregnant and feel unwell", "pregnancy_related"),
            ("my baby has been crying and off their food", "infant_or_young_child"),
            ("severe pain in my back", "severe_pain"),
        ],
    )
    def test_urgent_indicators_are_recognised(self, description, expected_rule):
        result = classify(description)

        assert result.tier_name == "URGENT"
        assert expected_rule in [m.rule_id for m in result.matches]

    def test_the_matched_terms_are_recorded_for_review(self):
        result = classify("I think I broke my wrist")

        assert result.matches[0].matched_terms


class TestSelfCareMustBeEarned:
    @pytest.mark.parametrize(
        "description",
        [
            "mild sore throat",
            "paper cut on my finger",
            "runny nose and sneezing",
            "mild headache",
            "a mosquito bite",
            "sore muscles after exercise",
        ],
    )
    def test_recognised_minor_complaints_are_self_care(self, description):
        assert classify(description).tier_name == "SELF_CARE"

    @pytest.mark.parametrize(
        "description",
        [
            "my knee feels weird lately",
            "something is off with my stomach",
            "I don't feel right",
            "asdfghjkl",
            "been feeling strange since Tuesday",
        ],
    )
    def test_unrecognised_descriptions_default_to_urgent(self, description):
        # The core safety property: not understanding something is not the
        # same as it being harmless.
        result = classify(description)

        assert result.tier_name == "URGENT"
        assert result.defaulted is True

    def test_the_default_explains_that_it_was_not_recognised(self):
        result = classify("my knee feels weird lately")

        assert "could not confidently recognise" in result.reasoning


class TestModifiersRevokeSelfCare:
    @pytest.mark.parametrize(
        "description",
        [
            "severe sore throat",
            "sore throat that is getting worse",
            "sore throat for weeks",
            "mild headache but I'm pregnant",
            "sore throat and I'm coughing up blood",
            "sudden mild headache",
            "mild headache and I feel confused",
        ],
    )
    def test_an_escalating_modifier_prevents_self_care(self, description):
        assert classify(description).tier_name != "SELF_CARE"

    def test_the_override_is_recorded_so_a_reviewer_can_see_why(self):
        result = classify("sore throat for weeks")

        rule_ids = [m.rule_id for m in result.matches]
        assert any(
            rid in ("self_care_overridden_by_modifier", "persistent_or_worsening")
            for rid in rule_ids
        )

    @pytest.mark.parametrize(
        "description",
        [
            # "for over a week" / "for over two weeks" do not contain the
            # literal substring "for a week" / "for two weeks", so these were
            # falling through to SELF_CARE despite plainly describing a
            # persisting, unresolved complaint. Found via ad-hoc testing
            # against a mono-like description.
            "sore throat for over a week",
            "sore throat for over two weeks",
            "mild cough for over a week",
            "runny nose for over a week",
            "sore throat for more than two weeks, swollen glands, extremely tired",
        ],
    )
    def test_over_and_more_than_duration_phrasing_prevents_self_care(self, description):
        assert classify(description).tier_name != "SELF_CARE"


class TestReasoningLanguage:
    @pytest.mark.parametrize(
        "description",
        [
            "I have crushing chest pain",
            "I think I broke my wrist",
            "mild sore throat",
            "my knee feels weird lately",
        ],
    )
    def test_reasoning_never_asserts_a_diagnosis(self, description):
        reasoning = classify(description).reasoning.lower()

        # Assertions about the person, not the word "diagnosis" itself —
        # "it is not a diagnosis" is exactly the disclaimer we want to keep.
        for phrase in (
            "you have ",
            "you are suffering",
            "this means you",
            "you probably have",
            "sounds like you have",
        ):
            assert phrase not in reasoning

    @pytest.mark.parametrize(
        "description", ["I think I broke my wrist", "my knee feels weird lately"]
    )
    def test_reasoning_disclaims_rather_than_diagnoses(self, description):
        reasoning = classify(description).reasoning.lower()

        assert "not a diagnosis" in reasoning or "not the same as" in reasoning

    @pytest.mark.parametrize(
        "description",
        ["I think I broke my wrist", "mild sore throat", "my knee feels weird"],
    )
    def test_reasoning_never_recommends_a_treatment(self, description):
        reasoning = classify(description).reasoning.lower()

        for phrase in ("take ", "apply ", "medication", "dose", "ibuprofen"):
            assert phrase not in reasoning


class TestNormalisation:
    def test_smart_apostrophes_do_not_defeat_the_rules(self):
        # iOS substitutes a curly apostrophe as the user types.
        assert classify("I can’t put weight on my ankle").tier_name == "URGENT"

    def test_matching_is_case_insensitive(self):
        assert classify("MILD SORE THROAT").tier_name == "SELF_CARE"

    def test_extra_whitespace_is_tolerated(self):
        assert classify("mild   sore    throat").tier_name == "SELF_CARE"


class TestDeterminism:
    def test_the_same_input_always_gives_the_same_tier(self):
        # Reproducibility is a requirement for clinical review.
        description = "I think I broke my wrist"
        tiers = {classify(description).tier_name for _ in range(5)}

        assert tiers == {"URGENT"}


class TestEverySelfCarePhraseIsBoundedByTheModifierCheck:
    """
    ⛔ THE PROPERTY THAT MAKES THE SELF-CARE LIST SAFE TO EXTEND.

    Adding a phrase here is the one edit in this module that can LOWER a tier.
    CLAUDE.md calls each addition "a decision that a complaint is ordinarily
    minor", and says what bounds it: "the escalating-modifier check still runs
    over all of them, so 'a head cold and a high fever' and 'reflux for over a
    week' are URGENT exactly as before."

    That bound had never been measured. Across all 66 phrases and four
    modifiers — 264 combinations — **none** stays SELF_CARE. The property
    holds.

    ⛔ THIS IS DELIBERATELY NOT A PIN ON THE LIST'S CONTENTS. Pinning the exact
    set would make every legitimate addition fail a test, which teaches people
    to edit the test rather than think. This asserts the thing that actually
    matters instead: whatever is in the list, adding a modifier still
    escalates it. A phrase added tomorrow is checked by this automatically,
    which is the opposite of a list somebody has to remember to update.

    What it would catch: a phrase whose pattern somehow swallows the modifier —
    the `a cold` / `a cold sore` defect one level up, where a self-care match
    survives text that should have overridden it. That defect was found by a
    10,000-case corpus; this finds the same shape for a few milliseconds.
    """

    MODIFIERS = (
        "and a high fever",
        "for over a week",
        "and it is getting worse",
        "and severe pain",
    )

    def test_no_phrase_stays_self_care_once_a_modifier_is_added(self):
        from app.core import rules_triage

        escaped: list[tuple[str, str]] = []
        checked = 0

        for phrase in rules_triage._SELF_CARE_PATTERNS:
            base = f"I have {phrase}"
            # A phrase that does not earn SELF_CARE alone is bounded already.
            if classify(base).tier_name != "SELF_CARE":
                continue
            for modifier in self.MODIFIERS:
                checked += 1
                if classify(f"{base} {modifier}").tier_name == "SELF_CARE":
                    escaped.append((phrase, modifier))

        # Guards against a vacuous pass: if the list were renamed or the base
        # sentence stopped matching, nothing would be checked and the
        # assertion below would succeed having proved nothing.
        assert checked > 100, f"only {checked} combinations were checked"
        assert escaped == [], (
            "these self-care phrases survive an escalating modifier, so the "
            f"bound CLAUDE.md relies on does not hold for them: {escaped[:10]}"
        )

    def test_every_listed_modifier_actually_escalates(self):
        """
        ⛔ THE SAME MECHANISM FROM THE OTHER SIDE.

        The test above asks whether every self-care phrase is caught by the
        modifiers. This asks whether every modifier catches. Both are needed:
        the first would still pass if half the list were non-functional, as
        long as the four it samples work.

        A modifier present in `_ESCALATING_MODIFIERS` but not actually
        escalating is worse than an absent one, because the list is what a
        reviewer reads to decide the mechanism is adequate. Dead entries make
        it look more covered than it is.

        All 55 work today. This keeps that true — a phrase added with a typo,
        or one whose wording cannot match after a change to how these compile,
        fails here rather than sitting in the list looking like protection.
        """
        from app.core import rules_triage

        base = "I have a sore throat"
        assert classify(base).tier_name == "SELF_CARE", (
            "the base description no longer earns SELF_CARE, so this test "
            "cannot tell an escalation from a description that was never "
            "self-care to begin with"
        )

        dead = [
            modifier
            for modifier in rules_triage._ESCALATING_MODIFIERS
            if classify(f"{base} {modifier}").tier_name == "SELF_CARE"
        ]

        assert len(rules_triage._ESCALATING_MODIFIERS) > 20, "list looks truncated"
        assert dead == [], (
            f"these modifiers are in the list but do not escalate: {dead[:10]}"
        )
