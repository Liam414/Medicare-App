"""
Handing off to a provider's own booking page.

MedHelp still cannot book an appointment — that needs a partnership, provider
opt-in and a BAA, none of which this project has. This is the thing it can do
instead: say where the hospital takes bookings, and let the person book there.

These tests hold the properties that make a hand-off a different thing from
booking, and keep it from drifting into one.
"""

import inspect

import pytest

from app.services import scheduling_links
from app.services.scheduling_links import MYCHART_DIRECTORY, link_for


# ---------------------------------------------------------------------------
# ⛔ Nothing about the user travels.
# ---------------------------------------------------------------------------


def test_the_url_is_returned_exactly_as_registered():
    """
    ⛔ THE LOAD-BEARING TEST IN THIS FILE.

    The whole argument for why a hand-off needs no BAA is that nothing about
    the person is transmitted. The moment a ZIP, a reason for visit or a tier
    is appended as a query parameter, MedHelp is sending health data to a third
    party — quietly, in a URL, which is the one place this repository is most
    careful to keep it out of.
    """
    link = link_for("Cleveland Clinic", is_organization=True)

    assert link is not None
    assert link.url == "https://mychart.clevelandclinic.org/openscheduling/standalone"
    assert "?" not in link.url
    assert "#" not in link.url


@pytest.mark.parametrize(
    "name",
    ["Cleveland Clinic", "UPMC Presbyterian", "Mount Sinai Hospital", "Some Hospital"],
)
def test_no_registered_url_carries_a_query_string(name):
    link = link_for(name, is_organization=True)

    assert link is not None
    assert "?" not in link.url, "a query string is where user data would hide"


def test_the_function_cannot_be_handed_user_data():
    """
    ⛔ ENFORCED ON THE SIGNATURE, not on good intentions.

    `link_for` takes a provider name and a boolean. There is no parameter here
    that could hold a symptom description, a ZIP or an assessment id, so a
    future edit that wanted to personalise the link would have to add one —
    which fails this test and becomes a decision rather than a slip.
    """
    parameters = list(inspect.signature(link_for).parameters)

    assert parameters == ["provider_name", "is_organization"]


def test_no_registered_url_is_a_search_engine():
    """
    ⛔ `docs/appointment-booking.md` rejected redirecting to search outright.

    The reason was that it drops somebody who has just been told to seek care
    onto a page of ads. A hand-off to a named provider's own booking page is a
    different thing; a hand-off to a search result is the rejected thing
    wearing this feature's clothes.
    """
    forbidden = ("google.", "bing.", "duckduckgo.", "search?q=", "maps.")

    for _, link in scheduling_links._REGISTRY:
        for fragment in forbidden:
            assert fragment not in link.url.lower()
    for fragment in forbidden:
        assert fragment not in MYCHART_DIRECTORY.url.lower()


def test_every_registered_url_is_https():
    """A booking page reached over http is one anybody on the network can read."""
    for _, link in scheduling_links._REGISTRY:
        assert link.url.startswith("https://")
    assert MYCHART_DIRECTORY.url.startswith("https://")


# ---------------------------------------------------------------------------
# Matching.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Cleveland Clinic", "Cleveland Clinic"),
        ("CLEVELAND CLINIC FOUNDATION", "Cleveland Clinic"),
        ("Cleveland Clinic Akron General", "Cleveland Clinic"),
        ("Houston Methodist Hospital", "Houston Methodist"),
        ("UPMC Presbyterian Shadyside", "UPMC"),
        ("Mount Sinai Beth Israel", "Mount Sinai"),
    ],
)
def test_a_known_system_resolves_to_its_own_page(name, expected):
    link = link_for(name, is_organization=True)

    assert link is not None
    assert link.system_name == expected
    assert link.kind == "direct"


def test_the_longest_match_wins():
    """
    "Mayo Clinic Health System" is a different organisation from "Mayo Clinic"
    and books somewhere else. Checking shorter entries first would send its
    patients to the wrong site, which is the kind of wrong that wastes a
    morning.
    """
    system = link_for("Mayo Clinic Health System - Austin", is_organization=True)
    clinic = link_for("Mayo Clinic Hospital Rochester", is_organization=True)

    assert system is not None and clinic is not None
    assert system.system_name == "Mayo Clinic Health System"
    assert clinic.system_name == "Mayo Clinic"
    assert system.url != clinic.url


def test_every_token_must_be_present():
    """
    A partial name must not match. "Sinai Hospital" is a real and unrelated
    hospital; sending its patients to Mount Sinai's booking page would be a
    confident wrong answer, which this repository prefers to an absent one
    nowhere.
    """
    link = link_for("Sinai Hospital of Baltimore", is_organization=True)

    assert link is None or link.kind == "directory"


# ---------------------------------------------------------------------------
# The directory fallback.
# ---------------------------------------------------------------------------


def test_an_unknown_hospital_gets_the_mychart_directory():
    """
    The registry is small on purpose; this is what gives coverage.

    Epic runs a public, searchable directory of the organisations using
    MyChart, with no login. For a hospital MedHelp does not know, that is a
    real answer rather than a shrug.
    """
    link = link_for("Synthetic Regional Medical Center", is_organization=True)

    assert link == MYCHART_DIRECTORY
    assert link.kind == "directory"


def test_an_individual_clinician_gets_nothing():
    """
    ⛔ A LINK THAT USUALLY FAILS TEACHES PEOPLE TO IGNORE THE BUTTON.

    A solo physician is unlikely to appear in the MyChart organisation
    directory under a name the user would recognise. Offering it anyway would
    spend the credibility of the one affordance that does work.
    """
    assert link_for("Jane Synthetic, MD", is_organization=False) is None


def test_a_known_system_still_matches_for_an_individual():
    """
    A clinician enumerated under a system's name still books through it — the
    directory fallback is what individuals are excluded from, not the registry.
    """
    link = link_for("Cleveland Clinic Primary Care", is_organization=False)

    assert link is not None
    assert link.kind == "direct"


def test_an_empty_name_resolves_to_nothing():
    assert link_for("", is_organization=True) is None
    assert link_for("   ", is_organization=True) is None


# ---------------------------------------------------------------------------
# ⛔ Kept apart from MedHelp's own booking capability.
# ---------------------------------------------------------------------------


def test_a_hand_off_is_not_medhelp_booking_anything():
    """
    ⛔ `scheduling_url` AND `online_booking_available` ARE DIFFERENT CLAIMS.

    `delivery_available()` answers "can MedHelp send a booking request?" — it
    is false, and it stands for a signed BAA and a scheduling partnership.
    This module answers "does this provider take bookings on their own site?".

    Nothing here may move that flag. If a single field ever covered both, a
    later edit could read "we can book" out of "they have a website", which is
    the over-promise this whole feature is built to avoid.
    """
    from app.services.request_delivery import delivery_available

    assert link_for("Cleveland Clinic", is_organization=True) is not None
    assert delivery_available() is False


def test_the_module_does_not_import_the_delivery_path():
    """
    Structural: the two ideas stay separable, not merely separate today.

    ⛔ THIS READS THE IMPORTS, NOT THE TEXT. A first version grepped the whole
    source and failed on the module's own docstring, which names
    `delivery_available()` precisely in order to explain why this is a
    different claim. That is documentation working as intended, and a test that
    punishes it would push the explanation out of the file that needs it.

    Same shape as `refill_forecast`'s rule that it must never import
    `dose_schedule`: assert against the import statements, so the property is
    about dependency rather than about vocabulary.
    """
    import ast

    tree = ast.parse(inspect.getsource(scheduling_links))
    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            imported.append(node.module or "")
            imported += [alias.name for alias in node.names]

    assert not any("request_delivery" in name for name in imported)
    assert not any("delivery_available" in name for name in imported)
