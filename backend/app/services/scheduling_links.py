"""
Where a provider's own online booking lives, when we know of one.

MedHelp cannot book an appointment. Every API that can — Zocdoc, Epic-hosted
scheduling, athenahealth — needs a signed partnership, provider-side opt-in and
a BAA, and this project has none of the three. That is unchanged and is
documented in `docs/appointment-booking.md`.

What this module does instead is **hand off**: it says "this hospital takes
bookings on its own website, here is the address", and the person books there.

## ⛔ Why a hand-off is a different thing from booking, and is allowed

The blocker on real booking is that it transmits an identified patient and a
reason for care to a third party. A hand-off transmits **nothing**:

- The link is a constant. Nothing about the user is appended to it — not their
  name, not their ZIP, not their symptom description, not the tier they were
  given. `test_scheduling_links.py` asserts the returned URL is byte-identical
  to the registered one.
- The match is made on the **provider's own published name**, which is public
  CMS data. No user input is read here at all.
- Opening it is the user pressing a button on a screen that says where it
  goes. MedHelp sends no request and learns nothing about what happens next.

So no vendor becomes a processor of anything, and no BAA question arises. This
is the same reasoning that lets the app link to a provider's phone number.

## ⛔ This is NOT `online_booking_available`, and must never be merged with it

`delivery_available()` answers "can MedHelp send a booking request itself?" —
false, and it stands for a signed BAA and a scheduling partnership.

This answers "does this provider take bookings on their own website?" — which
says nothing about MedHelp's capabilities and commits MedHelp to nothing. One
is a claim about us; the other is a fact about them. A single flag covering
both would let a future edit read "we can book" from "they have a website",
which is exactly the over-promise the appointment feature is built to avoid.

## ⛔ How an entry gets into the registry

Every URL below appeared in a live web search result at the date recorded
against it. **None was constructed by pattern** — guessing that a system's
booking page is at `/appointments` because another one's is would be inventing
a destination, and a link that 404s at the moment somebody is trying to get
care is worse than no link at all. That is the same rule the label parser
follows in refusing to snap a misread drug name to the nearest real one: a
visible gap beats a plausible error.

⛔ **Do not add an entry from memory.** Search for it, follow the link, and
record the date. The registry is deliberately small; the directory fallback
below is what gives coverage, and it needs no maintenance.

## The fallback that makes this worth having

Epic's MyChart runs a **public, searchable directory of the organisations that
use it**, at `mychart.org`, with no login required — verified 2026-09-18. Epic
is the dominant EHR in US hospitals, so for any hospital MedHelp does not know
directly, that directory is a real answer rather than a shrug.

It is offered for organisations only. A solo physician's office is unlikely to
be in it under a name the user would recognise, and a link that usually fails
teaches people to ignore the button.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SchedulingLink:
    """Somewhere a person can book, that is not MedHelp."""

    #: Whose site this is, as it should be named to the user.
    system_name: str
    url: str
    #: "direct"    — this system's own booking page.
    #: "directory" — a finder the user searches for their hospital in.
    kind: str


#: Epic's public directory of MyChart organisations. No login, searchable by
#: organisation name or state. Verified 2026-09-18.
MYCHART_DIRECTORY = SchedulingLink(
    system_name="MyChart",
    url="https://www.mychart.org/l/en-us/login/",
    kind="directory",
)


#: Match tokens -> link. **Every token must appear** in the provider's name,
#: which is what stops "Mount Sinai" matching a hospital of the same name in a
#: different city that is not part of that system.
#:
#: Each entry records the date its URL was seen in a search result.
_REGISTRY: tuple[tuple[tuple[str, ...], SchedulingLink], ...] = (
    (
        ("cleveland", "clinic"),
        SchedulingLink(
            system_name="Cleveland Clinic",
            # Open scheduling — bookable without a MyChart login.
            url="https://mychart.clevelandclinic.org/openscheduling/standalone",
            kind="direct",
        ),
    ),
    (
        ("houston", "methodist"),
        SchedulingLink(
            system_name="Houston Methodist",
            url="https://www.houstonmethodist.org/get-care-now/",
            kind="direct",
        ),
    ),
    (
        ("upmc",),
        SchedulingLink(
            system_name="UPMC",
            url="https://www.upmc.com/contact/appointments",
            kind="direct",
        ),
    ),
    (
        ("mount", "sinai"),
        SchedulingLink(
            system_name="Mount Sinai",
            url="https://www.mountsinai.org/appointment",
            kind="direct",
        ),
    ),
    (
        ("mass", "general", "brigham"),
        SchedulingLink(
            system_name="Mass General Brigham",
            url=(
                "https://www.massgeneralbrigham.org/en/patient-care"
                "/patient-visitor-information/appointments"
            ),
            kind="direct",
        ),
    ),
    (
        ("mayo", "clinic", "health", "system"),
        SchedulingLink(
            system_name="Mayo Clinic Health System",
            url="https://www.mayoclinichealthsystem.org/request-appointment",
            kind="direct",
        ),
    ),
    (
        ("mayo", "clinic"),
        SchedulingLink(
            system_name="Mayo Clinic",
            url="https://www.mayoclinic.org/appointments",
            kind="direct",
        ),
    ),
)


_WORD = re.compile(r"[a-z0-9]+")


def _tokens(name: str) -> set[str]:
    return set(_WORD.findall(name.lower()))


def link_for(provider_name: str, *, is_organization: bool) -> SchedulingLink | None:
    """
    The best booking destination known for this provider, or None.

    ⛔ READS THE PROVIDER'S NAME AND NOTHING ELSE. No user input reaches this
    function — not the ZIP they searched, not their reason for visit, not a
    tier. There is no parameter here that could carry health data, and a test
    asserts the signature stays that way.

    Order matters: a direct link to the system's own page beats the directory,
    because it is one step instead of two. `_REGISTRY` is checked longest-match
    first so "Mayo Clinic Health System" does not resolve to "Mayo Clinic".
    """
    tokens = _tokens(provider_name)
    if not tokens:
        return None

    for required, link in sorted(
        _REGISTRY, key=lambda entry: len(entry[0]), reverse=True
    ):
        if all(token in tokens for token in required):
            return link

    # Unknown organisation: Epic's own directory is a real answer for a
    # hospital, and a poor one for a single physician's office.
    if is_organization:
        return MYCHART_DIRECTORY

    return None
