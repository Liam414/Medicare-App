"""
Symptom intake and urgency estimate.

The tier comes from `app.core.triage` (deterministic red-flag screening plus a
model, resolved toward more care). The reading material shown alongside it
comes from MedlinePlus. The model never writes the health content the user
reads — it only estimates urgency and explains that estimate.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.check_ins import reported_worse_recently
from app.api.health_profile import load_health_profile
from app.api.profiles import owned_profile_id, profile_filter
from app.core.profile_triage import ProfileContext
from app.core import followup, interpretation, triage_log
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.triage import Tier, TriageNotConfigured, TriageUnavailable, assess
from app.db.session import get_db
from app.models.intake import IntakeAssessment
from app.models.user import User
from app.schemas.intake import (
    FollowUpQuestionOut,
    IntakeFeedbackRequest,
    IntakeHistoryItemOut,
    IntakeRecapEntryOut,
    IntakeRecapOut,
    IntakeRequest,
    IntakeResponse,
    NeedsDetailResponse,
)
from app.schemas.symptom import EmergencyGuidanceOut, SymptomTopicOut
from app.services import llm
from app.services.medlineplus import MedlinePlusUnavailable, search_topics
from app.services.search_terms import _NEGATIONS, candidate_queries, content_words, names_match

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake", tags=["intake"])

INTAKE_DISCLAIMER = (
    "This is an estimate of how soon you may need care. It is not a diagnosis "
    "and not medical advice. It is a suggestion, not a determination — you can "
    "always seek a higher level of care than this suggests, and you should if "
    "you are worried."
)

ESCALATION_GUIDANCE = (
    "If your symptoms change, get worse, or you become worried at any point, "
    "do not wait for this app. Call 911 or your local emergency number, or go "
    "to an emergency department."
)

TOPICS_SOURCE_NOTE = (
    "General information from MedlinePlus, published by the US National "
    "Library of Medicine. These topics were matched to the words you used. "
    "They are not tailored to you and are not a diagnosis."
)

USER_FACING_UNAVAILABLE = (
    "We couldn't assess this right now. Please don't wait on the app: if you "
    "feel unwell, contact a healthcare professional, and call 911 or your "
    "local emergency number if this may be an emergency."
)

# Appended only outside production, so a developer can tell a missing key from
# a real outage.
DEV_CONFIG_HINT = (
    "(Developer note: symptom intake has no model layer configured. Set "
    "LLM_BASE_URL and LLM_MODEL in backend/.env for the free agentic layer — "
    "http://localhost:11434/v1 with Ollama keeps every description on this "
    "machine — or ANTHROPIC_API_KEY for the paid one, then restart.)"
)


#: Longest a single picked phrase may be. The vocabulary's own entries are far
#: shorter; this only bounds what a client can post under this field.
MAX_SYMPTOM_PHRASE = 120


def merge_selected_symptoms(description: str, selected: list[str] | None) -> str:
    """
    Fold phrases the user picked from the symptom list into the description.

    ⛔ THE SEPARATOR IS THE SAFETY PROPERTY HERE, NOT A FORMATTING CHOICE.

    Every phrase in `emergency.py` and `rules_triage.py` is compiled with word
    boundaries, so two phrases run together match NOTHING. That is a bug this
    repository has already had in production: a pasted list arriving as
    "Chest painShortness of breath" was screened as neither, and fell to the
    URGENT default instead of EMERGENT. `normalize_query` splits a
    lowercase-to-uppercase boundary afterwards and would catch that particular
    shape, but it cannot catch "a feverchills", and a feature whose whole job
    is to build a list must not be the thing that manufactures the glue.

    So the join is ". " — the same separator `followup.merge` uses, and for
    the same reason: the combined text goes through emergency screening, the
    rules and the lookup as one description, and every phrase in it has to be
    reachable by a word-boundary match.

    The order is the client's, which is the vocabulary's own order rather than
    tap order — see `labelsFor` on the device. Deterministic input, because
    everything downstream of here is deterministic.
    """
    if not selected:
        return description

    parts = [description.strip()]
    for phrase in selected:
        cleaned = " ".join(phrase.split())[:MAX_SYMPTOM_PHRASE].strip()
        # A phrase that is only punctuation contributes nothing and would leave
        # a stray ". ." in text the rules are about to read.
        if cleaned and any(character.isalnum() for character in cleaned):
            parts.append(cleaned)

    return ". ".join(part for part in parts if part)


async def _related_topics(description: str) -> list[SymptomTopicOut]:
    """
    Reading material for whatever the user described, from a vetted source.

    The raw description is not searched directly: conversational phrasing
    ("my ankle's been killing me since I rolled it") matches nothing, and that
    empty result is why a tier used to arrive with nothing attached to it.
    `candidate_queries` strips the filler and then broadens a word at a time.

    Results are kept only if one of the names the SOURCE gives the topic — its
    title or one of its own published alternate titles — contains a word the
    user actually wrote. The upstream ranking is loose enough to answer
    "swollen ankle" with "Diabetic Heart Disease", and showing that beside
    someone's description would imply a diagnosis. A query whose results all
    fail that check is treated as a miss and the search broadens instead.

    Matching the alternate titles as well as the title is what stops the check
    rejecting the source's own vocabulary: NLM files bunions under "Toe
    Injuries and Disorders" and sunburn under "Sun Exposure", so a title-only
    test told those users nothing matched.

    A failure here is not fatal: the tier and the escalation path matter far
    more than the article, so an outage returns an empty list rather than
    failing the whole assessment. Coming back empty-handed is an acceptable
    outcome — the screen says so plainly.
    """
    words = content_words(description)

    # ⛔ NO CONTENT WORDS MEANS NO SEARCH, BECAUSE NO RESULT COULD BE KEPT.
    # `names_match` matches a topic's names against `words`; with `words`
    # empty it is False for every topic, so the filter below rejects whatever
    # comes back and this function returns [] regardless. Searching anyway
    # costs the one thing it should not: `candidate_queries` falls back to the
    # raw tokens here, and that fallback has no MAX_QUERY_WORDS cap, so the
    # person's ENTIRE description — digits included — goes to NLM as a GET
    # query string, to a vendor with no BAA, for a result that cannot be used.
    #
    # Measured over 12,602 corpus descriptions: 5 reach this, and 4 of them
    # are "I can't keep anything down" — an URGENT complaint, not filler. It
    # empties out because can/anything/down are stopwords and the CURLY
    # apostrophe iOS types is not in `_TOKEN_RE`, so can’t splits into can + t
    # and the t is one character and dropped. (The ASCII one keeps "can't".)
    #
    # Returning [] here is the same value the loop produced, minus the
    # request. CLAUDE.md's vendor table says NLM receives "up to 3 keywords";
    # this is what had made that untrue.
    #
    # ⛔ "No content words" means no words `names_match` can use — and it drops
    # negations before matching (see `_NEGATIONS`). So a description whose only
    # surviving word is a negation — "I can't keep anything down" typed with an
    # ASCII apostrophe leaves exactly ["can't"] — can match nothing either, and
    # checking `words` alone still sent it.
    if not [word for word in words if word not in _NEGATIONS]:
        return []

    for query in candidate_queries(description):
        try:
            topics = await search_topics(query, limit=5)
        except MedlinePlusUnavailable:
            logger.warning("MedlinePlus unavailable for related reading.")
            return []

        relevant = [t for t in topics if names_match(t.title, t.alt_titles, words)]
        if relevant:
            # alt_titles are match input only and are deliberately not
            # carried onto the wire — the topic is shown under its own name.
            return [
                SymptomTopicOut(
                    topic_id=topic.topic_id,
                    title=topic.title,
                    summary=topic.summary,
                    url=topic.url,
                    source_name=topic.source_name,
                    groups=topic.groups,
                )
                for topic in relevant[:3]
            ]

    return []


def _profile_context(
    profile_id: str | None, answers: dict[str, str], user: User, db: Session
) -> ProfileContext | None:
    """
    The health profile of whoever this assessment is for (decision 1).

    ⛔ Never a reason to fail an assessment. A stale profile id or an
    unreadable row means screening runs without the profile — which is what
    it did before profiles existed, and the profile can only ever raise a
    tier. Nothing about the row is logged.
    """
    try:
        scoped = owned_profile_id(profile_id, user, db)
        row = load_health_profile(user, scoped, db)
        worse = reported_worse_recently(user, scoped, db)
    except Exception:  # noqa: BLE001 — see docstring
        logger.warning("Health profile unavailable for an assessment; screening without it.")
        return None
    return ProfileContext(
        conditions=tuple(row.conditions) if row else (),
        allergies=tuple(row.allergies) if row else (),
        allergy_contact=answers.get(followup.ALLERGY_CONTACT.question_id, ""),
        reported_worse=worse,
    )


@router.post("/assess", response_model=None, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: IntakeRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IntakeResponse | NeedsDetailResponse:
    # How many rounds of questions have already been shown. Derived from the
    # answer keys server-side rather than taken from the client: the cap on
    # asking is a safety property, and presence of the field alone is still
    # what marks a submission as having been asked at least once, so a client
    # that posts `{}` is not sent round the same questions again.
    rounds_asked = followup.rounds_completed(payload.follow_up_answers)
    answers = payload.follow_up_answers or {}
    description = followup.merge(payload.description, answers) if answers else payload.description
    description = merge_selected_symptoms(description, payload.selected_symptoms)
    profile = _profile_context(payload.profile_id, answers, user, db)

    try:
        # ⛔ OFF THE EVENT LOOP. `assess` is synchronous and, when a model
        # layer is configured, spends nearly all of its time blocked on a
        # network call to it. This endpoint is `async def`, so calling it
        # directly ran it ON the event loop — and a blocked event loop serves
        # nobody: every other request in the process, including the sync
        # threadpool routes that load medications, appointments and reminders,
        # simply queues behind it. The symptom is the whole app hanging while
        # one person submits a symptom description.
        #
        # This was always latent — the Anthropic call took seconds — but a
        # local model turns seconds into minutes, so it became the app's
        # dominant failure mode rather than a hiccup. `run_in_threadpool` is
        # what FastAPI already does for a plain `def` route; this endpoint
        # cannot be one, because it awaits the topic lookup below.
        #
        # "Already asked" means "and will not be asked again" — which is only
        # true once every round is spent. Before that, a model asking for more
        # detail should get it rather than falling to the safe default.
        result = await run_in_threadpool(
            assess,
            description,
            followup_already_asked=rounds_asked >= followup.MAX_ROUNDS,
            profile=profile,
        )
    except TriageUnavailable as exc:
        # Deliberately a failure, not a tier. Telling someone "probably fine"
        # because a service was down is the worst possible outcome here.
        detail = USER_FACING_UNAVAILABLE

        if isinstance(exc, TriageNotConfigured):
            logger.error(
                "Symptom intake is unreachable: no model layer is configured. "
                "Set LLM_BASE_URL and LLM_MODEL in backend/.env for the free "
                "agentic layer, or ANTHROPIC_API_KEY for the paid one, and "
                "restart the server."
            )
            # In a known development environment, say why. A developer seeing
            # only "couldn't assess" cannot tell a misconfiguration from an
            # outage; an end user must never see configuration details.
            #
            # ⛔ `is_development`, NOT `!= "production"`. This was a raw string
            # compare, while `settings.is_development` normalises with
            # `.strip().lower()` — so `Production`, `PRODUCTION` and
            # `production ` all took the developer path and put
            # "Set LLM_BASE_URL... or ANTHROPIC_API_KEY" in front of an end
            # user, which is the exact thing the sentence above forbids. Worse,
            # `staging` and `prod` are not the string "production" either, and
            # both are deployments real people can reach.
            #
            # Fail safe: an unrecognised environment gets the plain message.
            if settings.is_development:
                detail = f"{USER_FACING_UNAVAILABLE} {DEV_CONFIG_HINT}"
        else:
            logger.warning("Triage unavailable: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from exc

    # Ask before answering, when the rules recognised nothing and there is no
    # red flag. `is_needed` is what enforces that second condition, but the
    # ordering matters too: `assess` has already run, so an emergency
    # description has its guidance in hand before this branch is reached and
    # simply falls past it.
    #
    # Up to `MAX_ROUNDS` times, and only while the previous round came back
    # with something usable. Someone who answered "not sure" to everything has
    # told us they cannot say more, and is given the safe default instead of
    # another questionnaire.
    if followup.is_needed(
        rules_defaulted=result.rules_defaulted,
        red_flag_match=result.red_flag_match,
        model_requested_followup=result.model_requested_followup,
        rounds_asked=rounds_asked,
        answers=answers,
    ):
        next_round = rounds_asked + 1
        response.status_code = status.HTTP_200_OK
        return NeedsDetailResponse(
            round=next_round,
            intro=followup.INTRO if next_round == 1 else followup.INTRO_SECOND_ROUND,
            questions=[
                FollowUpQuestionOut(**q.__dict__)
                # The description is passed so round one can skip what the
                # user has already told us. See `questions_for_round`.
                for q in followup.questions_for_round(
                    next_round,
                    answers,
                    description=description,
                    has_allergies=bool(profile and profile.allergies),
                )
            ],
            disclaimer=INTAKE_DISCLAIMER,
            escalation_guidance=ESCALATION_GUIDANCE,
        )

    # Dev-only, synthetic-data-only, off by default. See app/core/triage_log.py
    # for why this cannot be switched on in production.
    triage_log.record(
        description=description,
        followup_answers=answers or None,
        tier=result.tier.wire_value,
        rule_tier=result.rule_tier.wire_value if result.rule_tier else None,
        model_tier=result.model_tier.wire_value if result.model_tier else None,
        confidence=result.model_confidence,
        rules_defaulted=result.rules_defaulted,
        red_flag_match=result.red_flag_match,
        escalated_by_safety_net=result.escalated_by_safety_net,
        model_requested_followup=result.model_requested_followup,
        exhausted_followup=result.exhausted_followup,
        asked_followup=rounds_asked > 0,
        deduction_trace=result.deduction_trace,
    )

    # Reading material for the tiers the user can act on at their own pace.
    #
    # GATED OFF by default (`medlineplus_topics_enabled`). Topic selection is
    # lexical, so a topic sharing one word with the description can be both
    # unrelated and frightening — "my head has been pounding" returns "Head
    # and Neck Cancer". Held until a clinician rules on it; see CLAUDE.md.
    # While gated, no request is made, so nothing reaches NLM either.
    #
    # EMERGENT is excluded regardless. That screen has one job, "call 911
    # now", and blocking it behind a content lookup would delay it for no
    # benefit. This is the opposite of the rule in CLAUDE.md about content
    # outages suppressing emergency guidance: here the guidance is what wins.
    topics_disabled = not settings.medlineplus_topics_enabled
    related_topics: list[SymptomTopicOut] = []
    if not topics_disabled and result.tier is not Tier.EMERGENT:
        related_topics = await _related_topics(description)

    record_id: str | None = None
    try:
        store_under = owned_profile_id(payload.profile_id, user, db)
        storable = payload.consent_to_store
    except HTTPException:
        # ⛔ A stale or foreign profile id costs the stored row, never the
        # assessment. The screening above has already run and is returned.
        store_under, storable = None, False
    if storable:
        # Stored only with explicit consent; see the PHI note on the model.
        record = IntakeAssessment(
            user_id=user.id,
            profile_id=store_under,
            description=description,
            tier=result.tier.wire_value,
            reasoning=result.reasoning,
            model_tier=result.model_tier.wire_value if result.model_tier else None,
            model_id=result.model_id,
            rule_tier=result.rule_tier.wire_value if result.rule_tier else None,
            rule_ids=",".join(result.rule_ids) if result.rule_ids else None,
            rules_defaulted=result.rules_defaulted,
            red_flag_match=result.red_flag_match,
            escalated_by_safety_net=result.escalated_by_safety_net,
            model_confidence=result.model_confidence,
            followup_answers=json.dumps(answers) if answers else None,
            exhausted_followup=result.exhausted_followup,
            consented_to_logging=True,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record_id = record.id

    # What the answers told us, and what they did not. Only meaningful when
    # questions were actually asked, so it is omitted entirely otherwise.
    recap = followup.summarise(answers)
    summary = (
        IntakeRecapOut(
            understood=[
                IntakeRecapEntryOut(label=entry.label, value=entry.value)
                for entry in recap.understood
            ],
            unclear=recap.unclear,
        )
        if not recap.is_empty()
        else None
    )

    # ⛔ AFTER the tier is final, and it cannot change it. See the fence in
    # app/core/interpretation.py: this is the model reading the rule layer's
    # answer back to the person, never a second opinion about urgency. It is
    # skipped entirely on EMERGENT and returns None on any failure, in which
    # case the reviewed `reasoning` below is what the screen shows.
    # ⛔ In the threadpool, like `assess` above. `llm.chat` is synchronous
    # httpx, and calling it directly from this async endpoint would block the
    # event loop for the whole round trip — every other request on the worker,
    # including somebody else's emergency screening, waiting behind a nicety.
    reading = await run_in_threadpool(interpretation.interpret, description, result)

    return IntakeResponse(
        id=record_id,
        tier=result.tier.wire_value,
        reasoning=result.reasoning,
        interpretation=reading.text if reading else None,
        interpretation_model=reading.model_id if reading else None,
        model_layer_configured=llm.configured(llm.default_endpoint()),
        red_flag_match=result.red_flag_match,
        escalated_by_safety_net=result.escalated_by_safety_net,
        emergency=(
            EmergencyGuidanceOut(**result.emergency.__dict__) if result.emergency else None
        ),
        related_topics=related_topics,
        topics_source_note=TOPICS_SOURCE_NOTE if related_topics else None,
        topics_disabled=topics_disabled,
        summary=summary,
        disclaimer=INTAKE_DISCLAIMER,
        escalation_guidance=ESCALATION_GUIDANCE,
    )


@router.post("/{assessment_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
def report_assessment(
    assessment_id: str,
    payload: IntakeFeedbackRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Record that a user thought the tier was wrong, for later review."""
    record = (
        db.query(IntakeAssessment)
        .filter(
            IntakeAssessment.id == assessment_id,
            IntakeAssessment.user_id == user.id,
        )
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    record.user_reported_wrong = payload.reported_wrong
    db.commit()


# How many past assessments one read returns. A history, not an archive.
HISTORY_LIMIT = 50


def _recap_out(raw_answers: str | None) -> IntakeRecapOut | None:
    try:
        answers = json.loads(raw_answers) if raw_answers else {}
    except ValueError:
        answers = {}
    recap = followup.summarise(answers if isinstance(answers, dict) else {})
    if recap.is_empty():
        return None
    return IntakeRecapOut(
        understood=[IntakeRecapEntryOut(label=e.label, value=e.value) for e in recap.understood],
        unclear=recap.unclear,
    )


@router.get("", response_model=list[IntakeHistoryItemOut])
def list_assessments(
    profile_id: str | None = Query(None, description="Whose history. Omitted means your own."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[IntakeHistoryItemOut]:
    """
    The caller's own stored assessments, newest first.

    Only assessments the person consented to storing exist to be listed — an
    unconsented one was never written. Each row is read back exactly as it was
    stored and shown; nothing is re-assessed, and a tier is never recomputed
    against today's rules, because that would be a different answer presented
    as the one they were given.
    """
    scope = owned_profile_id(profile_id, user, db)
    rows = (
        db.query(IntakeAssessment)
        .filter(
            IntakeAssessment.user_id == user.id,
            profile_filter(IntakeAssessment.profile_id, scope),
        )
        .order_by(IntakeAssessment.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    return [
        IntakeHistoryItemOut(
            id=row.id,
            created_at=row.created_at,
            tier=row.tier,
            reasoning=row.reasoning,
            description=row.description,
            summary=_recap_out(row.followup_answers),
        )
        for row in rows
    ]


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """
    Remove one of the caller's stored assessments.

    Consent to store is not consent to keep forever. Now that a person can see
    what was stored, they can also take it back. Another user's id is a 404,
    never a 403, so the endpoint does not confirm that an id exists.
    """
    deleted = (
        db.query(IntakeAssessment)
        .filter(
            IntakeAssessment.id == assessment_id,
            IntakeAssessment.user_id == user.id,
        )
        .delete()
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
