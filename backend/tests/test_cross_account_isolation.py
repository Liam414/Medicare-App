"""
One account may not reach another account's records. Every route, not some.

⛔ WHY THIS IS A SWEEP AND NOT MORE PER-FILE TESTS.

Several suites already prove isolation for the feature they cover, and
`docs/security.md` records finding 2 — `GET /medications/reminders` was
unscoped — as closed. That is the problem: isolation was verified where
somebody remembered to verify it, one feature at a time, which is exactly the
shape of coverage that lets the fifteenth route be the one nobody wrote a test
for.

So this file enumerates **every route that takes a resource id** and asserts
the same property of all of them at once. A route added later with no scoping
fails here even if its own test file never thought about a second user.

## What "isolated" has to mean

**404, not 403.** A 403 on somebody else's appointment confirms the appointment
exists, which is a small leak but a real one: an id is guessable in a way a
record's contents are not, and "this is not yours" tells an attacker they found
something. Every route here answers as though the record simply is not there.

All data is synthetic.
"""

from __future__ import annotations

import pytest


def _medication(client, headers) -> str:
    response = client.post(
        "/medications",
        json={"name": "Placebofen", "dosage": "10 mg"},
        headers=headers,
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def _appointment(client, headers) -> str:
    response = client.post(
        "/appointments",
        json={
            "provider_name": "Synthetic Clinic",
            "reason_for_visit": "synthetic reason",
        },
        headers=headers,
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def _goal(client, headers) -> tuple[str, str]:
    response = client.post(
        "/goals",
        json={
            "title": "Walking more",
            "description": "I want to walk more",
            "activities": [{"text": "Walk after lunch", "cadence": "daily"}],
        },
        headers=headers,
    )
    assert response.status_code in (200, 201), response.text
    body = response.json()
    return body["id"], body["activities"][0]["id"]


class TestOneAccountCannotReachAnother:
    def test_a_medication_is_invisible_to_another_account(
        self, client, auth_headers, other_user_headers
    ):
        medication_id = _medication(client, auth_headers)

        for method, path in [
            ("get", f"/medications/{medication_id}"),
            ("put", f"/medications/{medication_id}"),
            ("delete", f"/medications/{medication_id}"),
            ("get", f"/reminders/medications/{medication_id}/suggestion"),
            ("put", f"/reminders/medications/{medication_id}"),
        ]:
            call = getattr(client, method)
            kwargs = {"headers": other_user_headers}
            if method in ("put", "post"):
                kwargs["json"] = {"name": "Taken over", "dosage": "1 mg"}
                if path.startswith("/reminders"):
                    kwargs["json"] = {"times": ["08:00"]}
            response = call(path, **kwargs)
            assert response.status_code == 404, (
                f"{method.upper()} {path} answered {response.status_code}, "
                "which tells another account the record exists"
            )

        # And the owner still has it — the sweep must not pass by breaking
        # the feature for everybody.
        assert client.get(
            f"/medications/{medication_id}", headers=auth_headers
        ).status_code == 200

    def test_an_appointment_is_invisible_to_another_account(
        self, client, auth_headers, other_user_headers
    ):
        appointment_id = _appointment(client, auth_headers)

        for method, path, payload in [
            ("get", f"/appointments/{appointment_id}", None),
            # ⛔ A VALID BODY ON PURPOSE. An incomplete one is rejected by
            # validation before the ownership check runs, so the test would
            # pass on a 422 without ever exercising the thing it is named for.
            ("put", f"/appointments/{appointment_id}", {"status": "SCHEDULED"}),
            ("delete", f"/appointments/{appointment_id}", None),
        ]:
            call = getattr(client, method)
            kwargs = {"headers": other_user_headers}
            if payload is not None:
                kwargs["json"] = payload
            response = call(path, **kwargs)
            assert response.status_code == 404, (
                f"{method.upper()} {path} answered {response.status_code}"
            )

        assert client.get(
            f"/appointments/{appointment_id}", headers=auth_headers
        ).status_code == 200

    def test_a_goal_is_invisible_to_another_account(
        self, client, auth_headers, other_user_headers
    ):
        goal_id, activity_id = _goal(client, auth_headers)

        for method, path, payload in [
            # Valid body, for the same reason as the appointment case above:
            # `activities` has min_length=1, so an empty list is a 422 that
            # never reaches the ownership check.
            (
                "put",
                f"/goals/{goal_id}",
                {
                    "title": "Taken over",
                    "activities": [{"text": "Taken over", "cadence": "daily"}],
                },
            ),
            ("delete", f"/goals/{goal_id}", None),
        ]:
            call = getattr(client, method)
            kwargs = {"headers": other_user_headers}
            if payload is not None:
                kwargs["json"] = payload
            response = call(path, **kwargs)
            assert response.status_code == 404, (
                f"{method.upper()} {path} answered {response.status_code}"
            )

        listed = client.get("/goals", headers=auth_headers).json()
        assert any(goal["id"] == goal_id for goal in listed)

    def test_a_listing_never_carries_another_accounts_rows(
        self, client, auth_headers, other_user_headers
    ):
        """
        The collection routes, which take no id and so cannot 404.

        A leak here is worse than one on a single record: it needs no guessed
        id at all.
        """
        _medication(client, auth_headers)
        _appointment(client, auth_headers)
        _goal(client, auth_headers)

        for path in ("/medications", "/appointments", "/goals", "/reminders"):
            response = client.get(path, headers=other_user_headers)
            assert response.status_code == 200, f"{path}: {response.text}"
            body = response.json()
            rows = body if isinstance(body, list) else body.get("reminders", body)
            assert rows == [] or rows == {}, f"{path} returned another account's rows"

    def test_routes_that_validate_first_still_reveal_nothing(
        self, client, auth_headers, other_user_headers
    ):
        """
        ⛔ THE STRONGER FORM OF THE PROPERTY, FOR THE ROUTES WHERE 404 IS THE
        WRONG THING TO ASSERT.

        `POST /appointments/{id}/submit` is gated by `delivery_available()`,
        and both it and the goal-completion route parse a request body before
        the handler runs — so a non-owner can see 422 or 503 rather than 404.

        Neither is a leak, but asserting a specific code would be testing the
        wrong thing. What actually has to hold is that **somebody else's id is
        indistinguishable from an id that does not exist**: if the two answered
        differently, the difference would itself let an attacker enumerate real
        ids without ever reading one.

        So this compares the two answers rather than pinning either.
        """
        appointment_id = _appointment(client, auth_headers)
        goal_id, activity_id = _goal(client, auth_headers)

        pairs = [
            (
                "post",
                f"/appointments/{appointment_id}/submit",
                "/appointments/no-such-id/submit",
                {},
            ),
            (
                "post",
                f"/goals/{goal_id}/activities/{activity_id}/completion",
                "/goals/no-such-id/activities/no-such-activity/completion",
                {},
            ),
        ]

        for method, owned_by_other, nonexistent, payload in pairs:
            call = getattr(client, method)
            theirs = call(owned_by_other, json=payload, headers=other_user_headers)
            nobodys = call(nonexistent, json=payload, headers=other_user_headers)
            assert theirs.status_code == nobodys.status_code, (
                f"{method.upper()} {owned_by_other} answered "
                f"{theirs.status_code} while a nonexistent id answered "
                f"{nobodys.status_code} — the difference is the leak"
            )
            assert theirs.json() == nobodys.json(), (
                f"{owned_by_other} and {nonexistent} returned different bodies"
            )

    @pytest.mark.parametrize(
        "method,path",
        [
            ("get", "/medications/does-not-exist"),
            ("get", "/appointments/does-not-exist"),
            ("delete", "/goals/does-not-exist"),
        ],
    )
    def test_an_unknown_id_answers_the_same_as_someone_elses(
        self, client, auth_headers, method, path
    ):
        """
        ⛔ The two answers must be indistinguishable.

        If an id belonging to another account answered differently from an id
        belonging to nobody, the difference would itself be the leak — an
        attacker could enumerate which ids are real without ever reading one.
        """
        response = getattr(client, method)(path, headers=auth_headers)
        assert response.status_code == 404
