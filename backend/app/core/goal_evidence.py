"""
Published guidance a proposed activity can be attributed to.

⛔ READ THIS BEFORE ADDING A LINE. The repository owner asked twice for goal
plans that are "proven", and this is the only form of that MedHelp is allowed
to ship: a row is attributed to a **published recommendation from a named
public health body, quoted verbatim, with a link**. It is the same shape as
the MedlinePlus rule that already governs every other piece of sourced health
content in this app, and it exists so that the evidence in front of a person
is somebody's published work rather than a language model's assertion.

## What a citation here claims, and what it does not

A citation says: *this kind of activity is the subject of this published
recommendation.* That is all.

It does **not** say the plan will work, that the guidance endorses this plan,
that it applies to this person, or that anything here was reviewed. The
guidance is about a behaviour in general; the goal, the schedule and the
wording of the row are MedHelp's. ⛔ **Every surface that renders a citation
must say so**, because a government logo under a model-written row reads as
endorsement unless something stops it reading that way.

## The rules, each asserted by a test

- ⛔ **Quotes are verbatim and complete.** Never paraphrase, trim to a
  fragment, or stitch two sentences together. A paraphrased guideline is
  app-authored clinical content wearing a citation, which is worse than no
  citation at all. A sleep-duration entry was dropped for exactly this reason:
  the figure is published as a table cell ("7 or more hours") and any sentence
  carrying it would have been written here.
- ⛔ **No agent may invent an entry.** Every one needs a real published
  document, fetched and quoted, and a human review pass. The register is
  deliberately short.
- ⛔ **An unknown domain gets no citation, never the nearest one.** Snapping a
  row to the closest domain is the same defect as snapping a misread drug name
  to the nearest real drug: it turns a visible gap into a plausible error.
- ⛔ **Nothing here may become an input to triage, or to anything that
  estimates urgency.** It is attribution for a lifestyle activity.

## Why a closed vocabulary

The model picks a `domain` id from this register and cannot supply a URL, a
publisher or a quote of its own — the same reason `CARE_SETTINGS` is a fixed
list in provider search. A model asked for a citation will produce a
plausible-looking one; a model asked to choose from eight ids either chooses
one or does not.

NOT REVIEWED BY A CLINICIAN. Which behaviour a goal should be pointed at is a
judgement, and the mapping from a row to a domain is made by the model. See
`docs/health-goals-prompt.md`.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    """
    One published recommendation.

    `quote` is reproduced exactly as published. `label` and everything else is
    bibliographic — a title, a publisher, a link — and never a summary of what
    the document says.
    """

    domain: str
    label: str
    publisher: str
    document: str
    url: str
    quote: str
    retrieved: str


# ⛔ EVERY QUOTE BELOW WAS FETCHED FROM THE URL BESIDE IT ON THE RETRIEVED DATE
# AND IS REPRODUCED VERBATIM. If you change one, re-fetch it; if the page has
# changed, update the quote and the date together or remove the entry. A quote
# that no longer appears at its URL is not a citation, it is a claim.
#
# ## Re-checked 2026-09-21, and two were wrong
#
# All eight were compared against their pages. Six matched exactly. Two did
# not, and both are annotated at their entry:
#
#   aerobic_activity      was missing "at least", which turns a floor into a
#                         target — and the prompt cites it as a CEILING
#   quit_smoking_support  had two sentences stitched together, which the rule
#                         above forbids in as many words
#
# ⛔ THIS CANNOT BE AUTOMATED, WHICH IS WHY IT DRIFTED. cdc.gov answers a
# scripted request with 403 regardless of the User-Agent sent, so there is no
# repo script that could have caught either of these, and none is committed:
# one that always fails is worse than none, because a red check nobody can fix
# is a check everybody learns to skip.
#
# Re-checking means a browser, or a tool that renders like one. It is a manual
# job, it takes about ten minutes for eight entries, and the two defects found
# on the first attempt are the argument for doing it rather than trusting the
# dates.
_SOURCES: tuple[Source, ...] = (
    Source(
        domain="aerobic_activity",
        label="Regular moderate activity, such as walking",
        publisher="Centers for Disease Control and Prevention",
        document="Adult Activity: An Overview",
        url="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
        # ⛔ "AT LEAST" WAS MISSING, AND IT IS THE HALF THAT CARRIES THE
        # MEANING. Re-checked against the page on 2026-09-21: the published
        # sentence is "Adults need at least 150 minutes...". Without those two
        # words the sentence reads as a target; with them it is a floor.
        #
        # That matters beyond accuracy, because `PLAN_SYSTEM_PROMPT` uses this
        # figure as a CEILING — "never propose more than it" — and cites this
        # quote as the authority for doing so. The source sets a minimum. See
        # the report: the ceiling may still be the right behaviour for other
        # reasons, but it cannot be justified by this sentence.
        quote=(
            "Adults need at least 150 minutes of moderate-intensity physical "
            "activity a week."
        ),
        retrieved="2026-09-21",
    ),
    Source(
        domain="strength_activity",
        label="Muscle-strengthening activity",
        publisher="Centers for Disease Control and Prevention",
        document="Adult Activity: An Overview",
        url="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
        quote="Adults also need 2 days of muscle-strengthening activity each week.",
        retrieved="2026-09-21",
    ),
    Source(
        domain="sit_less",
        label="Breaking up long periods of sitting",
        publisher="Centers for Disease Control and Prevention",
        document="Benefits of Physical Activity",
        url="https://www.cdc.gov/physical-activity-basics/benefits/index.html",
        quote=(
            "Adults who sit less and do any amount of moderate- to "
            "vigorous-intensity physical activity gain some health benefits."
        ),
        retrieved="2026-09-21",
    ),
    Source(
        domain="sleep_routine",
        label="A consistent sleep schedule",
        publisher="Centers for Disease Control and Prevention",
        document="About Sleep",
        url="https://www.cdc.gov/sleep/about/index.html",
        quote="Going to bed and getting up at the same time every day.",
        retrieved="2026-09-21",
    ),
    Source(
        domain="vegetables_and_fruit",
        label="Eating more vegetables and fruit",
        publisher="Centers for Disease Control and Prevention",
        document=(
            "Tips for Increasing Vegetables and Fruits in Your Diet: "
            "Healthy Eating for Healthy Weight"
        ),
        url=(
            "https://www.cdc.gov/healthy-weight-growth/healthy-eating/"
            "fruits-vegetables.html"
        ),
        quote=(
            "Substitute vegetables and fruits for calorie-dense foods to help "
            "reduce the amount of calories you eat as well as help you feel "
            "full longer."
        ),
        retrieved="2026-09-21",
    ),
    Source(
        domain="water_instead_of_sugary_drinks",
        label="Water in place of sugary drinks",
        publisher="Centers for Disease Control and Prevention",
        document="About Water and Healthier Drinks",
        url=(
            "https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/"
            "index.html"
        ),
        quote=(
            "Water has no calories, so replacing sugary drinks with plain "
            "water can help reduce caloric intake."
        ),
        retrieved="2026-09-21",
    ),
    Source(
        domain="quit_smoking_support",
        label="Free coaching support for quitting smoking",
        publisher="Centers for Disease Control and Prevention",
        document="How to Quit Smoking (Tips From Former Smokers)",
        url="https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/index.html",
        # ⛔ TWO SENTENCES WERE STITCHED, WHICH THIS FILE'S OWN RULE FORBIDS:
        # "Never paraphrase, trim to a fragment, or stitch two sentences
        # together." The entry carried "...help you quit smoking." followed by
        # "Available in several languages.", and on a re-check of the page on
        # 2026-09-21 only the first could be found.
        #
        # Keeping the one whole published sentence that verifies is not
        # "trimming to a fragment" — it is dropping a second sentence that is
        # no longer evidence. If the missing half is on the page in a form a
        # fetch does not see (a caption, a badge), it can be restored as its
        # own entry rather than glued onto this one.
        quote=(
            "Quitlines provide free coaching over the phone to help you quit "
            "smoking."
        ),
        retrieved="2026-09-21",
    ),
    Source(
        domain="social_connection",
        label="Staying connected to other people",
        publisher="Centers for Disease Control and Prevention",
        document="Social Connection",
        url="https://www.cdc.gov/social-connectedness/about/index.html",
        quote=(
            "Staying connected to others creates feelings of belonging and "
            "being loved, cared for, and valued."
        ),
        retrieved="2026-09-21",
    ),
)

BY_DOMAIN: dict[str, Source] = {source.domain: source for source in _SOURCES}

DOMAINS: tuple[str, ...] = tuple(source.domain for source in _SOURCES)


def resolve(domain: str | None) -> Source | None:
    """
    The source for a domain id, or None.

    ⛔ There is no nearest match and there must never be one. A row MedHelp
    cannot attribute is rendered with no citation, which is honest; a row
    attributed to the closest-looking guideline is a fabricated one.
    """
    if not domain:
        return None
    return BY_DOMAIN.get(domain.strip().lower())


def prompt_vocabulary() -> str:
    """
    The domain list as the planner is shown it.

    Built from the register rather than written out again, so a domain cannot
    exist in the prompt without existing here - which is how the model would
    come to name a citation that has no source behind it.
    """
    return "\n".join(f"- {source.domain}: {source.label}" for source in _SOURCES)


def coverage(domains: Iterable[str | None]) -> tuple[int, int]:
    """
    How much of a plan points at published guidance. Returns `(backed, total)`.

    A row counts as backed only if its domain id actually resolves to a
    `Source` above. An unknown id counts as unbacked, for the same reason
    `resolve` has no nearest match: a row this app could not attribute must
    never be counted as one it could.

    ⛔ THIS IS A COUNT, NOT A VERDICT. It says how much of a plan points at
    somebody's published recommendation, which is the only sense in which
    anything here is "proven". It does not say the plan is good, that it suits
    this person, that it will work, or that the publisher endorses it - see
    the module docstring for the whole of what a citation claims. A plan where
    every row is backed is still a plan no clinician has read.

    It exists because attribution was previously invisible in aggregate: a
    plan with nothing published behind any row rendered exactly like one with
    a source under every row, so a person had no way to tell the difference.
    """
    total = 0
    backed = 0
    for domain in domains:
        total += 1
        if resolve(domain) is not None:
            backed += 1
    return backed, total
