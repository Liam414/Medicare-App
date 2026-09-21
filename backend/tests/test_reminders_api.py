"""
Tests for the reminders API.

All fixtures are synthetic. Two things matter most here and are tested first:
a reminder is never reachable by another user, and a suggestion never becomes
a saved schedule on its own.
"""


def _add_medication(client, headers, **overrides) -> str:
    payload = {
        "name": "Synthetic Tablet",
        "dosage": "10 mg",
        "frequency": "TAKE 1 TABLET BY MOUTH TWICE DAILY",
        **overrides,
    }
    response = client.post("/medications", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


class TestOwnership:
    def test_a_second_user_cannot_see_the_first_users_reminders(
        self, client, auth_headers, other_user_headers
    ):
        """
        The shape of a PHI leak, asserted against directly.

        CLAUDE.md records an earlier scaffold's reminders endpoint returning
        every row for every user. This one is scoped from the outset.
        """
        medication_id = _add_medication(client, auth_headers)
        client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )

        mine = client.get("/reminders", headers=auth_headers).json()
        theirs = client.get("/reminders", headers=other_user_headers).json()

        assert sum(len(row["reminders"]) for row in mine) == 2
        assert theirs == []
        # Not merely empty — the other user's medication name must not appear.
        assert "Synthetic Tablet" not in str(theirs)

    def test_another_users_medication_is_not_schedulable(
        self, client, auth_headers, other_user_headers
    ):
        medication_id = _add_medication(client, auth_headers)

        response = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00"]},
            headers=other_user_headers,
        )

        # 404 rather than 403: an unknown id and someone else's id must be
        # indistinguishable, or this becomes a way to discover records exist.
        assert response.status_code == 404

    def test_another_users_medication_gives_no_suggestion(
        self, client, auth_headers, other_user_headers
    ):
        medication_id = _add_medication(client, auth_headers)

        response = client.get(
            f"/reminders/medications/{medication_id}/suggestion",
            headers=other_user_headers,
        )

        assert response.status_code == 404

    def test_reminders_require_signing_in(self, client, auth_headers):
        _add_medication(client, auth_headers)

        assert client.get("/reminders").status_code == 401


class TestSuggestion:
    def test_a_suggestion_saves_nothing(self, client, auth_headers):
        """
        The read-then-confirm rule, asserted.

        Asking what MedHelp would propose must leave the user with no
        reminders at all until they confirm the times themselves.
        """
        medication_id = _add_medication(client, auth_headers)

        suggested = client.get(
            f"/reminders/medications/{medication_id}/suggestion", headers=auth_headers
        ).json()
        assert suggested["recognised"] is True
        assert suggested["times"] == ["08:00", "20:00"]

        schedules = client.get("/reminders", headers=auth_headers).json()
        assert schedules[0]["reminders"] == []

    def test_the_printed_directions_come_back_verbatim(self, client, auth_headers):
        printed = "TAKE 1 TABLET BY MOUTH TWICE DAILY WITH FOOD"
        medication_id = _add_medication(client, auth_headers, frequency=printed)

        body = client.get(
            f"/reminders/medications/{medication_id}/suggestion", headers=auth_headers
        ).json()

        # Unedited, so the screen can show the label's own words beside the
        # times it is proposing.
        assert body["frequency"] == printed

    def test_as_needed_directions_are_refused_with_a_reason(self, client, auth_headers):
        medication_id = _add_medication(
            client, auth_headers, frequency="TAKE 1 TABLET EVERY 6 HOURS AS NEEDED"
        )

        body = client.get(
            f"/reminders/medications/{medication_id}/suggestion", headers=auth_headers
        ).json()

        assert body["recognised"] is False
        assert body["times"] == []
        assert "as needed" in body["reason"].lower()


class TestSavingASchedule:
    def test_saving_times_creates_the_reminders(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)

        response = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert [r["time_of_day"] for r in response.json()["reminders"]] == [
            "08:00",
            "20:00",
        ]

    def test_saving_replaces_rather_than_appends(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)
        client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )

        body = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["09:00"]},
            headers=auth_headers,
        ).json()

        # The screen shows the whole day at once, so saving means "this is the
        # day", not "add one more alarm".
        assert [r["time_of_day"] for r in body["reminders"]] == ["09:00"]

    def test_an_empty_list_turns_reminders_off(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)
        client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00"]},
            headers=auth_headers,
        )

        body = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": []},
            headers=auth_headers,
        ).json()

        assert body["reminders"] == []

    def test_a_silenced_time_stays_silenced_when_another_is_edited(
        self, client, auth_headers
    ):
        medication_id = _add_medication(client, auth_headers)
        saved = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        ).json()
        morning = next(r for r in saved["reminders"] if r["time_of_day"] == "08:00")
        client.patch(
            f"/reminders/{morning['id']}?enabled=false", headers=auth_headers
        )

        body = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "21:00"]},
            headers=auth_headers,
        ).json()

        kept = next(r for r in body["reminders"] if r["time_of_day"] == "08:00")
        assert kept["enabled"] is False

    def test_a_malformed_time_is_rejected(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)

        for bad in ["8am", "0800", "25:00", "08:60", "8:00"]:
            response = client.put(
                f"/reminders/medications/{medication_id}",
                json={"times": [bad]},
                headers=auth_headers,
            )
            # Rejected, never reinterpreted: a mis-parsed time is a medication
            # taken at the wrong hour.
            assert response.status_code == 422, bad

    def test_a_rejected_time_is_not_echoed_back(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)

        response = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["not-a-time"]},
            headers=auth_headers,
        )

        # Same posture as everywhere else in this app — the submitted value is
        # stripped from validation errors before they leave the server.
        assert "not-a-time" not in response.text

    def test_the_same_time_twice_is_rejected(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)

        response = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00", "08:00"]},
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_too_many_times_in_a_day_is_rejected(self, client, auth_headers):
        medication_id = _add_medication(client, auth_headers)

        response = client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"]},
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestListing:
    def test_medications_without_reminders_are_still_listed(self, client, auth_headers):
        _add_medication(client, auth_headers)

        body = client.get("/reminders", headers=auth_headers).json()

        # So the screen can offer to set them up rather than hiding the row.
        assert len(body) == 1
        assert body[0]["reminders"] == []

    def test_the_listing_carries_the_directions_for_display(self, client, auth_headers):
        _add_medication(client, auth_headers)

        body = client.get("/reminders", headers=auth_headers).json()

        assert body[0]["frequency"] == "TAKE 1 TABLET BY MOUTH TWICE DAILY"

    def test_deleting_a_medication_removes_its_reminders(
        self, client, auth_headers, db_session
    ):
        """
        An alarm for a medication the user has stopped would tell them to take
        it anyway, so the rows must actually go.

        Asserted against the table rather than the listing: the listing joins
        through `medications`, so an orphaned reminder would be invisible there
        while still sitting in the database. SQLite does not enforce the
        foreign key cascade at all, which is exactly how that would be missed.
        """
        from app.models.reminder import MedicationReminder

        medication_id = _add_medication(client, auth_headers)
        client.put(
            f"/reminders/medications/{medication_id}",
            json={"times": ["08:00"]},
            headers=auth_headers,
        )
        assert db_session.query(MedicationReminder).count() == 1

        client.delete(f"/medications/{medication_id}", headers=auth_headers)

        assert db_session.query(MedicationReminder).count() == 0
        assert client.get("/reminders", headers=auth_headers).json() == []


class TestTheTableHoldsNoSecondCopyOfHealthData:
    """
    ⛔ THE STRUCTURAL GUARANTEE, WHICH NOTHING WAS ENFORCING.

    `MedicationReminder`'s docstring says the medication *name* is
    "deliberately not copied here: it already lives on `medications`, and a
    second copy would be a second place health data leaks from."

    Both its siblings are enforced against the mapped table — `appointments`
    may gain no identity column, `provider_locations` no user column, and both
    are mutation-checked. This one was stated in two places and checked in
    none, which is the same shape of gap that let `GET /medications/reminders`
    ship unscoped (closed finding 2).

    A name column here would be easy to add and hard to notice: it makes the
    listing query simpler and every existing test still passes.
    """

    def test_no_column_could_hold_a_medication_name(self):
        from app.models.reminder import MedicationReminder

        columns = {column.name for column in MedicationReminder.__table__.columns}
        forbidden = {
            "name",
            "medication_name",
            "drug",
            "drug_name",
            "dosage",
            "medication_dosage",
            "strength",
            "frequency",
            "directions",
            "sig",
            "notes",
            "label",
        }

        overlap = columns & forbidden
        assert overlap == set(), (
            f"medication_reminders gained {sorted(overlap)}. The name lives on "
            "`medications` and is joined for; a second copy is a second place "
            "health data leaks from."
        )

    def test_the_table_holds_only_what_it_needs(self):
        """
        The whole column set, pinned.

        Broader than the denylist above, which can only catch names somebody
        thought of. Anything new here is a decision about where health data
        rests, so it should be one somebody makes on purpose.
        """
        from app.models.reminder import MedicationReminder

        assert {column.name for column in MedicationReminder.__table__.columns} == {
            "id",
            "user_id",
            "medication_id",
            "time_of_day",
            "enabled",
            "created_at",
            "updated_at",
        }

    def test_a_time_is_a_wall_clock_string_not_an_instant(self):
        """
        "Eight in the morning means eight in the morning wherever the person
        is" — a datetime column carries an instant, and converting through a
        timezone would move a medication time when somebody travels.
        """
        from sqlalchemy import String

        from app.models.reminder import MedicationReminder

        column = MedicationReminder.__table__.columns["time_of_day"]

        assert isinstance(column.type, String), (
            f"time_of_day is {column.type!r}; a wall-clock time must not be "
            "stored as a datetime, which carries an instant"
        )
