from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.symptom import EmergencyGuidanceOut, SymptomTopicOut


class IntakeRequest(BaseModel):
    """
    Submitted in a POST body, never a URL: the description is the most
    sensitive free text in the app.
    """

    # ⛔ MAY BE EMPTY, BUT ONLY WHEN `selected_symptoms` CARRIES SOMETHING.
    #
    # This was `min_length=1` until 2026-09-17, because typing was the only way
    # in. The repository owner asked for the symptom list to be usable on its
    # own — "you can only use that if you want to" — and a person who taps
    # three phrases and types nothing submits exactly this shape.
    #
    # The floor did not move to zero, it moved to `_at_least_one_input` below.
    # A request with neither is still refused: estimating urgency from nothing
    # at all would return the safe default with no basis under it, and a tier
    # nobody described is worse than an error.
    description: str = Field(default="", max_length=2000)
    # Explicit, per-submission consent. Defaults to False so a client that
    # forgets the field stores nothing.
    consent_to_store: bool = False
    # Whose description this is, for the history it is stored under. ⛔ Never
    # read by triage, and never a reason to refuse an assessment: an id the
    # caller does not own means the row is not stored, not that screening is
    # withheld.
    profile_id: str | None = Field(default=None, max_length=64)
    # Answers to the follow-up prompts, keyed by question id. Present on any
    # submission after the first. Merged into the description server-side so
    # the combined text is re-screened from the top — see app/core/followup.py.
    #
    # A later round carries the earlier rounds' answers too: the server reads
    # which round this is from the ids present, so the cap on asking cannot be
    # talked past by a client that reports its own round number.
    follow_up_answers: dict[str, str] | None = None
    # Symptom phrases the user picked from the on-device list, as text.
    #
    # THE PHRASES TRAVEL, NOT IDS, AND THAT IS DELIBERATE. The vocabulary lives
    # in the mobile bundle (mobile/src/services/symptomVocabulary.ts) so that a
    # partially typed symptom never leaves the device. Sending ids would mean a
    # second copy of a clinical vocabulary here to resolve them, and two copies
    # drift — one of them would eventually be offering a phrase the other had
    # removed. The server treats these as what they are: plain text the user
    # endorsed, merged into the description and screened with it.
    #
    # They are capped rather than trusted. A client can put anything here, but
    # it could put the same thing in `description`, so this opens no new door.
    selected_symptoms: list[str] | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _at_least_one_input(self) -> "IntakeRequest":
        """
        Something has to have been said, in one box or the other.

        ⛔ THE MESSAGE NAMES NO VALUE, AND THAT IS NOT A STYLE CHOICE. The
        `RequestValidationError` handler in `app/main.py` strips the submitted
        input from every validation error precisely because this endpoint's
        input is the most sensitive free text in the app. An error string that
        quoted what was sent would put a symptom description back on the wire
        through the one path built to keep it off.
        """
        described = bool(self.description and self.description.strip())
        picked = bool(self.selected_symptoms)
        if not described and not picked:
            raise ValueError(
                "Describe your symptoms or pick at least one from the list."
            )
        return self


class FollowUpQuestionOut(BaseModel):
    question_id: str
    prompt: str
    kind: str  # "text" | "choice"
    choices: list[str]
    helper: str


class NeedsDetailResponse(BaseModel):
    """
    Returned instead of a tier when the description was not understood.

    Deliberately carries no tier, not even a provisional one: showing an
    urgency estimate beside a request for more detail would invite the user to
    act on a number the app has just said it cannot stand behind. Emergency
    guidance is never withheld this way — a red-flag description skips the
    questions entirely and gets its assessment immediately.
    """

    status: Literal["needs_detail"] = "needs_detail"
    # Which round of questions this is, 1-based. The client shows it so a
    # second set does not look like the first set repeating, and echoes the
    # earlier answers back so the server can merge the whole picture.
    round: int = 1
    intro: str
    questions: list[FollowUpQuestionOut]
    # Repeated here because the client renders this screen without an
    # assessment to read them from.
    disclaimer: str
    escalation_guidance: str


class IntakeRecapEntryOut(BaseModel):
    label: str
    value: str


class IntakeRecapOut(BaseModel):
    """
    What the app heard back from the follow-up questions, and what it still
    does not know.

    Strictly a receipt: `value` is the user's own text, and `label` is a fixed
    field heading. Nothing here is inferred, and no condition is ever named —
    see `summarise` in app/core/followup.py.
    """

    understood: list[IntakeRecapEntryOut]
    unclear: list[str]


class IntakeHistoryItemOut(BaseModel):
    """
    One stored assessment, read back to the person who made it.

    ⛔ Only fields that were already shown to them on the result screen, and
    nothing an auditor wants that they do not: no rule ids, no model tier, no
    confidence. `description` is what was stored — the person's own words with
    their follow-up answers joined on, verbatim. It is never re-summarised.
    """

    id: str
    created_at: datetime
    tier: str
    reasoning: str
    description: str
    summary: IntakeRecapOut | None


class IntakeResponse(BaseModel):
    status: Literal["assessed"] = "assessed"
    id: str | None  # null when the user did not consent to storage
    tier: str  # EMERGENT | URGENT | SELF_CARE
    reasoning: str

    # True when deterministic red-flag screening matched, independent of the
    # model. Surfaced so the UI can be honest about why it escalated.
    red_flag_match: bool
    escalated_by_safety_net: bool
    emergency: EmergencyGuidanceOut | None

    # Background reading matched to the description, sourced from MedlinePlus
    # and rendered verbatim — never written by the model. Populated on every
    # tier except EMERGENT, where the only thing worth showing is how to get
    # emergency help. Empty when the source matched nothing or was down; the
    # app has no fallback content and must not invent any.
    related_topics: list[SymptomTopicOut]
    topics_source_note: str | None
    # True when the reading-material feature is switched off entirely, as
    # opposed to switched on and having matched nothing. The client needs the
    # difference: "we found nothing for you" is the wrong thing to say when
    # nothing was ever looked up.
    topics_disabled: bool = False

    # Present only when follow-up questions were answered. Lets the result
    # screen say what it took from the answers and what is still blank, which
    # is the honest explanation for a default tier.
    summary: IntakeRecapOut | None = None

    # The model's plain-language reading of the tier the rules produced.
    #
    # ⛔ COMMENTARY, NEVER A VERDICT. `app/core/interpretation.py` runs after
    # the tier is final and cannot change it; there is deliberately no tier,
    # score or confidence on this object, so nothing here can be mistaken for a
    # second opinion. Absent whenever no endpoint is configured, the endpoint
    # failed, the answer was rejected by the safety checks, or the tier is
    # EMERGENT — where guidance to call 911 must not wait behind a round trip.
    #
    # The client must keep rendering `reasoning` whether or not this is here.
    interpretation: str | None = None
    # Which model wrote it, so the screen can attribute it rather than letting
    # it read as the app speaking.
    interpretation_model: str | None = None
    # True when a model endpoint is configured at all. Lets the client say that
    # half the feature is switched off, rather than silently showing less.
    model_layer_configured: bool = False

    # Safety copy the client must render. Sent from the server so there is one
    # reviewable source of truth rather than per-screen restatements.
    disclaimer: str
    escalation_guidance: str


class IntakeFeedbackRequest(BaseModel):
    """Lets a user say the tier felt wrong — the key signal for later review."""

    reported_wrong: bool = True
