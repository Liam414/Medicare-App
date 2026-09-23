"""
Unit tests for app/core/security.py password hashing and JWT helpers.

These are pure functions (no DB), so no fixtures/overrides are needed.
"""

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_roundtrip_verifies():
    plain = "synthetic-test-password-1"

    hashed = hash_password(plain)

    assert hashed != plain
    assert verify_password(plain, hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct-password-1")

    assert verify_password("wrong-password-1", hashed) is False


def test_create_and_decode_access_token_roundtrip():
    token = create_access_token(subject="synthetic-user-id-123")

    subject = decode_access_token(token)

    assert subject == "synthetic-user-id-123"


def test_decode_access_token_invalid_token_returns_none():
    result = decode_access_token("not-a-real-jwt-token")

    assert result is None


class TestTheTestSuiteDoesNotHideAWeakenedCostFactor:
    """
    ⛔ conftest.py LOWERS THE bcrypt COST FACTOR FOR SPEED. THIS IS WHY THAT IS
    SAFE.

    At the real cost of 12 a hash takes ~0.166s, and `verify_dummy` burns a
    second one on every failed login so that "no such account" and "wrong
    password" take the same time. Correct in production; in the suite it was
    almost all of the runtime — test_appointments_api.py spent 54s, of which
    0.3s was the eleven tests.

    ⛔ Lowering it in conftest means every other test in this repository now
    runs against cheap hashing, so none of them can notice if the real cost
    factor were lowered too. That is exactly the shape CLAUDE.md warns about:
    a suite that is green for the wrong reason. This test is the one place
    that reads the untouched production configuration, so the weakening stays
    confined to pytest and a real regression still fails something.

    ⛔ Do not "fix" this by reading `security.pwd_context` — conftest has
    already replaced that object by the time any test runs. It reads the
    configuration in a separate interpreter, where the swap never happened.
    """

    def test_the_production_cost_factor_is_not_the_test_one(self):
        # ⛔ In a fresh interpreter, so conftest's swap cannot reach it. This
        # used to import `tests.conftest`, which only works when pytest has
        # registered conftest under exactly that module name; under
        # --import-mode=importlib the import re-runs conftest, captures the
        # already-swapped cost-4 context, and fails with production untouched.
        import pathlib
        import subprocess
        import sys

        backend = pathlib.Path(__file__).resolve().parents[1]
        probe = (
            "from app.core.security import pwd_context;"
            "print(pwd_context.handler('bcrypt').default_rounds)"
        )
        result = subprocess.run(
            [sys.executable, "-c", probe],
            cwd=backend,
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, result.stderr
        rounds = int(result.stdout.strip().splitlines()[-1])

        assert rounds >= 12, (
            f"production bcrypt cost is {rounds}; OWASP's floor is 10 and this "
            "app has used 12. A lower value makes offline cracking of a stolen "
            "hash cheaper by 2x per round removed."
        )

    def test_the_tests_really_are_running_on_the_cheap_context(self):
        # Guards the other direction: if the conftest swap silently stopped
        # working, this file would still pass while the suite stayed slow, and
        # nobody would know which of the two states they were in.
        from app.core import security

        assert security.pwd_context.handler("bcrypt").default_rounds < 12
