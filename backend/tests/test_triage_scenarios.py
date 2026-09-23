"""
Ratchet over the frozen profile-scenario set (scripts/triage_eval/profile_scenarios.py).

⛔ These floors only stop the score getting worse. Never raise one by adding
a phrase because a case here missed — that turns a blind set into a tuning
set. Raise a floor only when a change made for some other reason lifts it.
"""

import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "triage_eval_profile_scenarios",
    Path(__file__).resolve().parents[1] / "scripts" / "triage_eval" / "profile_scenarios.py",
)
scenarios = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
# @dataclass looks its module up in sys.modules while the file executes.
sys.modules[_spec.name] = scenarios
_spec.loader.exec_module(scenarios)

# First run, 2026-09-22, rules only.
RED_FLAGS_CAUGHT_FLOOR = 19
UNDER_TRIAGED_CEILING = 6


def _independent():
    return [s for s in scenarios.SCENARIOS if not s.profile_dependent]


def test_the_set_holds_at_least_twenty_red_flag_cases():
    assert sum(s.gold == scenarios.E for s in _independent()) >= 20


def test_every_scenario_is_synthetic_and_carries_a_profile_field():
    for s in scenarios.SCENARIOS:
        assert isinstance(s.conditions, tuple) and isinstance(s.allergies, tuple)


def test_red_flag_detection_does_not_get_worse():
    result = scenarios.score(_independent())
    assert result["red_caught"] >= RED_FLAGS_CAUGHT_FLOOR
    assert len(result["under"]) <= UNDER_TRIAGED_CEILING


def test_no_red_flag_scenario_is_ever_told_self_care():
    for s in _independent():
        if s.gold == scenarios.E:
            assert scenarios.classify(s) != scenarios.S, s.description
