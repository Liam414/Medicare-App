import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SymptomIntakeScreen } from "@/screens/intake/SymptomIntakeScreen";
import { IntakeError, submitIntake } from "@/services/intakeService";

jest.mock("@/services/intakeService", () => {
  const actual = jest.requireActual("@/services/intakeService");
  return { ...actual, submitIntake: jest.fn() };
});

const mockedSubmit = submitIntake as jest.MockedFunction<typeof submitIntake>;

const ASSESSMENT = {
  status: "assessed" as const,
  id: null,
  tier: "SELF_CARE" as const,
  reasoning: "Synthetic reasoning.",
  redFlagMatch: false,
  escalatedBySafetyNet: false,
  emergency: null,
  relatedTopics: [],
  topicsSourceNote: null,
  topicsDisabled: false,
  interpretation: null,
  interpretationModel: null,
  modelLayerConfigured: false,
  summary: null,
  disclaimer: "Not a diagnosis.",
  escalationGuidance: "Call 911 if this may be an emergency.",
};

/*
  The field says "(optional)" since 2026-09-17, because it is: a person can
  answer entirely by tapping. Named once here so the wording is one edit rather
  than ten, and so the reason survives — a required-looking field is the thing
  that stops somebody scrolling to the list underneath it.
*/
const FIELD_LABEL = "Describe your symptoms (optional)";

function renderScreen() {
  const navigate = jest.fn();
  render(<SymptomIntakeScreen navigation={{ navigate } as any} route={{} as any} />);
  return { navigate };
}

async function describeSymptoms(text = "sore throat for two days") {
  fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), text);
  await act(async () => {
    fireEvent.press(screen.getByText("Get an urgency estimate"));
  });
}

describe("SymptomIntakeScreen", () => {
  beforeEach(() => {
    mockedSubmit.mockReset();
  });

  it("shows the disclaimer before anything is submitted", () => {
    renderScreen();

    // Must be visible up front, not revealed after a result.
    expect(screen.getByText("This estimates urgency. It does not diagnose.")).toBeTruthy();
    expect(screen.getByText(/not a substitute for a clinician/i)).toBeTruthy();
  });

  it("offers emergency services before any assessment has run", () => {
    renderScreen();

    expect(screen.getByText("Call 911")).toBeTruthy();
  });

  it("says what the person typed is not rewritten, and that added phrases are separate", () => {
    // The typed description reaches the classifier as the person wrote it —
    // the keyword extraction in `search_terms.py` only chooses which article
    // to look up and never alters the text. It is a claim the code has to keep
    // true: if anything ever paraphrases the description on the way in, this
    // line has to go with it.
    //
    // ⛔ THE OLD WORDING WAS "Nothing here is rewritten before it is assessed"
    // AND IT MUST NOT COME BACK. Once MedHelp began offering symptom phrases
    // of its own, a flat claim that the app adds nothing became false. The
    // sentence now separates the two halves: what you typed is untouched, and
    // what the app contributed is visible and removable.
    renderScreen();

    expect(
      screen.getByText(
        "Your own words — what you type is never rewritten. Anything you add from the list below is shown separately, and you can remove it."
      )
    ).toBeTruthy();
  });

  it("never claims the app adds nothing to the description", () => {
    // The specific false sentence, pinned so a revert fails rather than
    // quietly restoring a claim the symptom picker disproves.
    renderScreen();

    expect(screen.queryByText(/Nothing here is rewritten/)).toBeNull();
  });

  it("requires something — typed or tapped — before calling the API", () => {
    /*
      ⛔ THE FLOOR MOVED ON 2026-09-17; IT DID NOT DISAPPEAR.

      Typed prose used to be mandatory. It is not any more — see the test
      below — but an entirely empty submission is still refused, because
      estimating urgency from nothing would return the safe default with no
      basis of any kind under it.
    */
    renderScreen();

    fireEvent.press(screen.getByText("Get an urgency estimate"));

    expect(screen.getByText(/type a description, or pick from the list/i)).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("navigates to the result on success", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    const { navigate } = renderScreen();

    await describeSymptoms();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("IntakeResult", {
        assessment: ASSESSMENT,
        // Carried so the appointment flow can prefill the reason for visit
        // without the user describing their symptoms a second time.
        description: "sore throat for two days",
      })
    );
  });

  it("does not store the description unless the user opts in", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    await describeSymptoms();

    // The last two arguments are the follow-up answers (none on a first
    // submission) and the phrases picked from the symptom list (none, because
    // this test does not touch it).
    expect(mockedSubmit).toHaveBeenCalledWith("sore throat for two days", false, undefined, []);
  });

  it("passes consent through when the user opts in", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    fireEvent.press(
      screen.getByLabelText(/^Save this description so it can be reviewed for accuracy,/)
    );
    await describeSymptoms();

    expect(mockedSubmit).toHaveBeenCalledWith("sore throat for two days", true, undefined, []);
  });

  it("sends phrases picked from the symptom list alongside the description", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText(FIELD_LABEL),
      "my throat is really sore"
    );
    fireEvent.press(screen.getByTestId("symptom-matched-sore-throat"));

    await act(async () => {
      fireEvent.press(screen.getByText("Get an urgency estimate"));
    });

    // The typed text is unchanged, and the picked phrase travels beside it
    // rather than being spliced into it. The server does the joining, with a
    // separator, because two phrases run together match no red-flag rule.
    expect(mockedSubmit).toHaveBeenCalledWith(
      "my throat is really sore",
      false,
      undefined,
      ["a sore throat"]
    );
  });

  it("submits picked symptoms with nothing typed at all", async () => {
    /*
      ⛔ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-09-17.

      It read "will not submit a picked symptom with no description of its
      own", on the reasoning that the list was an aid to someone already
      writing rather than a form to fill in instead. The repository owner
      asked for the reverse — that the list be usable on its own — and
      CLAUDE.md records the reversal and what it costs.

      Left as a rewrite rather than a deletion so the history is legible: this
      is a decision that changed, not a rule nobody was enforcing.
    */
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    // Type just enough to surface a suggestion, tap it, then clear the box.
    fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), "sore throat");
    fireEvent.press(screen.getByTestId("symptom-matched-sore-throat"));
    fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), "");

    await act(async () => {
      fireEvent.press(screen.getByText("Get an urgency estimate"));
    });

    expect(mockedSubmit).toHaveBeenCalledWith("", false, undefined, ["a sore throat"]);
  });

  it("reaches the symptom list without anything being typed", () => {
    /*
      The half of this that is not the submit button.

      `matchSymptoms` needs three characters before it offers anything, so
      before browsing existed an empty screen showed no phrases and there was
      nothing to tap — the only way to reach the vocabulary was to start
      writing, which is precisely what the person this feature is for does not
      want to do.
    */
    renderScreen();

    expect(screen.getByText("Or pick from a list")).toBeTruthy();
    expect(screen.getByTestId("symptom-area-chest")).toBeTruthy();
  });

  it("carries the picked phrases forward as the description when nothing was typed", async () => {
    /*
      The appointment flow prefills its reason for visit from this, and the
      follow-up screen resubmits it. Passing the empty typed text would hand
      both an empty complaint from a person who described one perfectly well
      by tapping.
    */
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    const { navigate } = renderScreen();

    fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), "sore throat");
    fireEvent.press(screen.getByTestId("symptom-matched-sore-throat"));
    fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), "");

    await act(async () => {
      fireEvent.press(screen.getByText("Get an urgency estimate"));
    });

    expect(navigate).toHaveBeenCalledWith(
      "IntakeResult",
      expect.objectContaining({ description: "a sore throat" })
    );
  });

  it("shows a failure as a failure, never as reassurance", async () => {
    mockedSubmit.mockRejectedValueOnce(
      new IntakeError(
        "We couldn't assess this right now. Contact a healthcare professional, and call 911 if this may be an emergency."
      )
    );
    const { navigate } = renderScreen();

    await describeSymptoms();

    await waitFor(() => expect(screen.getByText(/couldn't assess this/i)).toBeTruthy());
    // Critically: no result screen, so no tier is implied.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not submit twice when the button is pressed twice", () => {
    mockedSubmit.mockReturnValueOnce(new Promise(() => {}));
    renderScreen();

    fireEvent.changeText(screen.getByLabelText(FIELD_LABEL), "headache");
    const button = screen.getByText("Get an urgency estimate");
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps typing available when dictation is unsupported", () => {
    renderScreen();

    // jsdom has no SpeechRecognition, so this exercises the unsupported path.
    expect(screen.getByText(/dictation isn't available/i)).toBeTruthy();
    expect(screen.getByLabelText(FIELD_LABEL)).toBeTruthy();
  });
});


describe("starting a new description", () => {
  /*
    The bug this guards: "Describe something else" navigates BACK to this
    screen, which is already mounted underneath the result. There is no fresh
    mount to clear the form, so the previous description was still sitting in
    the box. These tests drive the same shape — one mounted component, params
    changing underneath it — rather than re-rendering from scratch, because a
    fresh mount would pass even with the fix removed.
  */
  const FIELD = FIELD_LABEL;
  // Matches either state — the label now says which, so a reader can tell.
const CONSENT = /^Save this description so it can be reviewed for accuracy,/;

  function renderWithParams(params: object | undefined) {
    const navigation = { navigate: jest.fn(), setParams: jest.fn() };
    const view = render(
      <SymptomIntakeScreen navigation={navigation as any} route={{ params } as any} />
    );
    return { navigation, view };
  }

  it("clears the previous description when asked to reset", () => {
    const { navigation, view } = renderWithParams(undefined);

    fireEvent.changeText(screen.getByLabelText(FIELD), "a sore throat");
    expect(screen.getByLabelText(FIELD).props.value).toBe("a sore throat");

    // The same mounted screen, now navigated back to with { reset: true }.
    view.rerender(
      <SymptomIntakeScreen
        navigation={navigation as any}
        route={{ params: { reset: true } } as any}
      />
    );

    expect(screen.getByLabelText(FIELD).props.value).toBe("");
  });

  it("also clears consent, which was given for the previous description", () => {
    // Carrying a tick forward would store a second piece of health data under
    // permission granted for something else.
    const { navigation, view } = renderWithParams(undefined);

    fireEvent.press(screen.getByLabelText(CONSENT));
    expect(screen.getByLabelText(CONSENT).props.accessibilityState.checked).toBe(true);

    view.rerender(
      <SymptomIntakeScreen
        navigation={navigation as any}
        route={{ params: { reset: true } } as any}
      />
    );

    expect(screen.getByLabelText(CONSENT).props.accessibilityState.checked).toBe(false);
  });

  it("consumes the reset flag so a later return does not wipe new text", () => {
    const { navigation } = renderWithParams({ reset: true });

    expect(navigation.setParams).toHaveBeenCalledWith({ reset: undefined });
  });

  it("leaves the description alone when no reset was asked for", () => {
    // Coming back from the follow-up questions must not destroy what the user
    // is still editing.
    const { navigation, view } = renderWithParams(undefined);

    fireEvent.changeText(screen.getByLabelText(FIELD), "my knee hurts");
    view.rerender(
      <SymptomIntakeScreen navigation={navigation as any} route={{ params: {} } as any} />
    );

    expect(screen.getByLabelText(FIELD).props.value).toBe("my knee hurts");
  });
});
