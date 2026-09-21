"""
The AI interpretation layer: it explains a tier and can never change one.

These hold the fences in `app/core/interpretation.py`. The load-bearing ones
are the first two — that it is skipped on an emergency, and that it has no way
to express a tier at all.
"""

from __future__ import annotations

import dataclasses
import inspect
from unittest.mock import patch

import pytest

from app.core import interpretation
from app.core.triage import Tier, TriageResult
from app.services import llm


def result(tier: Tier, *, rule_ids=(), defaulted=False) -> TriageResult:
    return TriageResult(
        tier=tier,
        reasoning="reviewed copy",
        red_flag_match=tier is Tier.EMERGENT,
        emergency=None,
        model_tier=None,
        model_id=None,
        escalated_by_safety_net=False,
        rule_tier=tier,
        rule_ids=list(rule_ids),
        rules_defaulted=defaulted,
        model_confidence=None,
        model_requested_followup=False,
        exhausted_followup=False,
        deduction_trace=None,
    )


def reply(text: str):
    return llm.ChatReply(text=text, tool_calls=[], model_id="test-model")


class TestItCannotBecomeATier:
    def test_what_it_returns_has_no_tier_field_of_any_kind(self):
        """
        ⛔ THE STRUCTURAL GUARANTEE. Everything else here is a behaviour that
        could be reasoned about; this is the one that makes the others hard to
        undo. A caller cannot mistake this for a second opinion because there
        is nothing on it to mistake.
        """
        fields = {f.name for f in dataclasses.fields(interpretation.Interpretation)}
        assert fields == {"text", "model_id"}
        for forbidden in ("tier", "urgency", "level", "score", "confidence", "risk"):
            assert not any(forbidden in name for name in fields)

    def test_triage_does_not_import_this_module(self):
        """
        ⛔ The tier is decided before this runs and must stay that way. If
        triage ever imported this, the model's prose could reach the
        reconciliation that is still `max()` over the rules and the classifier.
        """
        for module in ("triage", "rules_triage", "emergency", "deduction"):
            source = (
                inspect.getsource(__import__(f"app.core.{module}", fromlist=[module]))
            )
            assert "interpretation" not in source, module


class TestItIsNeverCalledOnAnEmergency:
    def test_should_interpret_is_false_for_emergent(self):
        assert interpretation.should_interpret(result(Tier.EMERGENT)) is False

    def test_it_is_true_for_the_other_two(self):
        assert interpretation.should_interpret(result(Tier.URGENT)) is True
        assert interpretation.should_interpret(result(Tier.SELF_CARE)) is True

    def test_an_emergency_never_reaches_the_model(self):
        """Guidance to call 911 does not wait behind a round trip."""
        with patch.object(llm, "chat") as chat:
            assert interpretation.interpret("chest pain", result(Tier.EMERGENT)) is None
        chat.assert_not_called()


class TestFailureIsSilence:
    def test_no_endpoint_configured_returns_none(self):
        with patch.object(llm, "configured", return_value=False):
            assert interpretation.interpret("a cough", result(Tier.SELF_CARE)) is None

    def test_an_outage_returns_none_rather_than_raising(self):
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", side_effect=llm.LLMUnavailable("down")
        ):
            assert interpretation.interpret("a cough", result(Tier.URGENT)) is None

    def test_an_unexpected_error_returns_none_rather_than_raising(self):
        """An assessment must never fail because a nicety did."""
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", side_effect=RuntimeError("boom")
        ):
            assert interpretation.interpret("a cough", result(Tier.URGENT)) is None


class TestWhatItMayNotSay:
    @pytest.mark.parametrize(
        "text",
        [
            "This is nothing to worry about.",
            "You probably don't need to be seen.",
            "It is not serious, wait and see.",
        ],
    )
    def test_reassurance_is_dropped_above_self_care(self, text):
        """
        ⛔ The deterministic half of property 4: displayed text never argues
        for a lower tier than the one shown.
        """
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            assert interpretation.interpret("x", result(Tier.URGENT)) is None

    @pytest.mark.parametrize(
        "text",
        [
            "This sounds like a migraine.",
            "You probably have a chest infection.",
            "The pattern is consistent with appendicitis.",
        ],
    )
    def test_a_named_condition_is_dropped_at_every_tier(self, text):
        for tier in (Tier.URGENT, Tier.SELF_CARE):
            with patch.object(llm, "configured", return_value=True), patch.object(
                llm, "chat", return_value=reply(text)
            ):
                assert interpretation.interpret("x", result(tier)) is None

    @pytest.mark.parametrize(
        "text",
        [
            # ⛔ EIGHT WAYS TO NAME A CONDITION THAT THE FIRST PATTERN MISSED.
            #
            # The three cases above are the three phrasings `_DIAGNOSIS` was
            # written from, so they passed while proving nothing about the
            # shape of the rule. Found 2026-09-20 by writing what a model would
            # plausibly say rather than what the regex already held.
            #
            # Naming a condition is the thing App Scope says this app may never
            # do, and it is worse here than anywhere else because it appears
            # beside a tier, which lends it authority the sentence has not
            # earned.
            "This looks like appendicitis.",
            "That is typical of a migraine.",
            "These are classic signs of a migraine.",
            "It may well be tonsillitis.",
            "People with these symptoms often have tonsillitis.",
            "This points to a kidney infection.",
            "The likely cause is a sinus infection.",
            # `sounds like (a|an|the)` required an article, so dropping one
            # word walked straight through it.
            "Sounds like flu to me.",
        ],
    )
    def test_more_ways_of_naming_a_condition_are_dropped(self, text):
        for tier in (Tier.URGENT, Tier.SELF_CARE):
            with patch.object(llm, "configured", return_value=True), patch.object(
                llm, "chat", return_value=reply(text)
            ):
                assert interpretation.interpret("x", result(tier)) is None

    @pytest.mark.parametrize(
        "text",
        [
            # ⛔ SIX WAYS TO REASSURE THAT THE FIRST PATTERN MISSED.
            #
            # Each of these printed beside an URGENT tier tells somebody the
            # opposite of what the tier says. "It can safely wait" under
            # "get this seen soon" is the property-4 violation this check
            # exists to make impossible, in words the list did not hold.
            "You should be fine.",
            "It is likely harmless.",
            "Try not to be concerned.",
            "This will clear up on its own.",
            "There is no hurry to be seen.",
            "It can safely wait.",
        ],
    )
    def test_more_ways_of_reassuring_are_dropped_above_self_care(self, text):
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            assert interpretation.interpret("x", result(Tier.URGENT)) is None

    @pytest.mark.parametrize(
        "text",
        [
            "This usually settles on its own with rest.",
            "There is no rush, but see someone if it changes.",
        ],
    )
    def test_reassurance_is_still_allowed_at_self_care(self, text):
        """
        ⛔ The widened list must not start refusing the tier it is FOR.

        SELF_CARE means "this usually settles on its own" — saying so there is
        the honest answer, not a violation. Over-dropping at SELF_CARE would
        silently delete the interpretation on the one tier where reassurance
        is correct, and the failure is invisible because failure is silence.
        """
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            assert interpretation.interpret("x", result(Tier.SELF_CARE)) is not None

    def test_an_answer_longer_than_the_cap_is_dropped(self):
        long = "This is a plain sentence about timing. " * 40
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(long)
        ):
            assert interpretation.interpret("x", result(Tier.URGENT)) is None

    def test_an_ordinary_explanation_is_kept(self):
        text = (
            "Nothing specific in what you wrote was recognised by the screening "
            "rules, so the cautious answer was given. Contact a clinic in the "
            "next day or so."
        )
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            got = interpretation.interpret("x", result(Tier.URGENT, defaulted=True))
        assert got is not None
        assert got.text == text
        assert got.model_id == "test-model"

    def test_settling_on_its_own_is_allowed_under_self_care_only(self):
        """
        The same sentence is honest at SELF_CARE and forbidden above it. The
        check is tier-aware for that reason rather than being a flat ban.
        """
        text = "This should settle on its own over a few days."
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            assert interpretation.interpret("x", result(Tier.SELF_CARE)) is not None
        with patch.object(llm, "configured", return_value=True), patch.object(
            llm, "chat", return_value=reply(text)
        ):
            assert interpretation.interpret("x", result(Tier.URGENT)) is None


class TestWhatItIsToldAboutTheRules:
    def test_it_is_told_when_nothing_was_recognised(self):
        line = interpretation._rules_line(result(Tier.URGENT, defaulted=True))
        assert "No named screening rule" in line

    def test_it_is_told_which_rules_fired(self):
        line = interpretation._rules_line(
            result(Tier.URGENT, rule_ids=("severe_pain", "infection_signs"))
        )
        assert "infection_signs" in line and "severe_pain" in line

    def test_the_prompt_forbids_naming_a_condition(self):
        prompt = interpretation.SYSTEM_PROMPT.lower()
        assert "never name a condition" in prompt
        assert "never recommend a treatment" in prompt
        assert "never argue for more or less urgency" in prompt
