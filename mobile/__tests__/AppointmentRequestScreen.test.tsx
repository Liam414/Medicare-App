import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  AppointmentRequestScreen,
  PREFERRED_TIMES,
  VISIT_REASONS,
} from "@/screens/appointments/AppointmentRequestScreen";
import { requestAppointment } from "@/services/appointmentService";
import type { Provider } from "@/services/providerService";

jest.mock("@/hooks/useActiveProfile", () => ({
  // Resolved to the account holder, as a single-person account always is.
  useActiveProfile: () => ({
    active: null,
    profiles: [],
    ready: true,
    profileId: null,
    refresh: jest.fn(),
  }),
}));
jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  requestAppointment: jest.fn(),
}));

const mockRequest = requestAppointment as jest.MockedFunction<
  typeof requestAppointment
>;

const PROVIDER: Provider = {
  npi: "1000000001",
  name: "Synthetic Urgent Care",
  specialty: "Clinic/Center, Urgent Care",
  phone: "(212) 555-0143",
  address: "1 Synthetic Plaza, New York, NY, 10001",
  city: "New York",
  state: "NY",
  postalCode: "10001",
  sourceName: "NPPES NPI Registry, US Centers for Medicare & Medicaid Services",
  distanceMiles: 1.2,
  schedulingUrl: null,
  schedulingSystem: null,
  schedulingKind: null,
};

function savedAppointment(overrides = {}) {
  return {
    id: "appointment-1",
    providerName: PROVIDER.name,
    providerNpi: PROVIDER.npi,
    providerSpecialty: PROVIDER.specialty,
    providerPhone: PROVIDER.phone,
    providerAddress: PROVIDER.address,
    reasonForVisit: "Sore throat and a fever since Tuesday.",
    preferredTime: null,
    urgencyTier: null,
    sourceAssessmentId: null,
    notes: null,
    status: "REQUESTED" as const,
    providerNotified: false,
    createdAt: "2026-08-29T10:00:00Z",
    ...overrides,
  };
}

function renderScreen(intake?: {
  reasonForVisit: string;
  tier: "EMERGENT" | "URGENT" | "SELF_CARE";
  assessmentId: string | null;
}) {
  const replace = jest.fn();
  const goBack = jest.fn();
  render(
    <AppointmentRequestScreen
      navigation={{ replace, goBack } as any}
      route={{ params: { provider: PROVIDER, intake } } as any}
    />
  );
  return { replace, goBack };
}

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(savedAppointment());
});

describe("AppointmentRequestScreen", () => {
  it("says the clinic will not be contacted, before the form", () => {
    // The user is about to fill in a reason and a preferred time. If they only
    // learn afterwards that they still have to phone, they may never phone.
    renderScreen();

    expect(screen.getByText("MedHelp can't contact the clinic")).toBeTruthy();
    expect(screen.getByText(/please call \(212\) 555-0143/i)).toBeTruthy();
  });

  it("does not label the action as booking", () => {
    renderScreen();

    expect(screen.queryByText(/^book/i)).toBeNull();
    expect(screen.getByText("Save this appointment")).toBeTruthy();
  });

  it("prefills the reason from a symptom check", () => {
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    expect(
      screen.getByDisplayValue("Sore throat and a fever since Tuesday.")
    ).toBeTruthy();
  });

  it("lets the user edit the prefilled reason before anything is saved", async () => {
    // The description was written to answer a triage question, not to tell a
    // receptionist why you are coming in. The user gets the last word.
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    fireEvent.changeText(
      screen.getByDisplayValue("Sore throat and a fever since Tuesday."),
      "Fever, want it checked."
    );
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0][0].reasonForVisit).toBe(
      "Fever, want it checked."
    );
  });

  it("carries the urgency context through to the saved record", async () => {
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const payload = mockRequest.mock.calls[0][0];
    expect(payload.urgencyTier).toBe("URGENT");
    expect(payload.sourceAssessmentId).toBe("assessment-1");
    expect(payload.providerNpi).toBe("1000000001");
  });

  it("refuses to save without a reason for visit", async () => {
    renderScreen();

    fireEvent.press(screen.getByText("Save this appointment"));

    expect(
      await screen.findByText("Enter what you'd like to be seen about.")
    ).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when saving fails", async () => {
    mockRequest.mockRejectedValue(new Error("network"));
    renderScreen({
      reasonForVisit: "Sore throat.",
      tier: "URGENT",
      assessmentId: null,
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    expect(
      await screen.findByText(/couldn't save this appointment/i)
    ).toBeTruthy();
  });

  it("replaces rather than pushes the confirmation, so the form cannot be resubmitted", async () => {
    const { replace } = renderScreen({
      reasonForVisit: "Sore throat.",
      tier: "URGENT",
      assessmentId: null,
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "AppointmentConfirmation",
        expect.objectContaining({ appointment: expect.anything() })
      )
    );
  });
});

describe("filling the form by tapping instead of typing", () => {
  it("fills the preferred time from a chip", async () => {
    renderScreen();

    fireEvent.press(screen.getByTestId("quickfill-time-this-week"));
    fireEvent.changeText(screen.getByLabelText("Reason for visit"), "Check-up");
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ preferredTime: "This week" }), null
      )
    );
  });

  it("sends the chip's exact words, with no hidden value behind them", async () => {
    /*
      ⛔ WHAT THE CHIP SAYS IS WHAT TRAVELS.

      `preferred_time` is free text a person will read out to a receptionist.
      If a chip ever carried a code or an id that the server expanded, the user
      would be agreeing to words they never saw — and it would be the first
      step toward these becoming slot identifiers, which is the thing CLAUDE.md
      fences until a real scheduling integration exists.
    */
    renderScreen();

    fireEvent.press(screen.getByTestId("quickfill-time-as-soon-as-possible"));
    fireEvent.changeText(screen.getByLabelText("Reason for visit"), "Check-up");
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ preferredTime: "As soon as possible" }), null
      )
    );
  });

  it("clears the field when the chosen chip is pressed again", async () => {
    renderScreen();

    fireEvent.press(screen.getByTestId("quickfill-time-tomorrow"));
    fireEvent.press(screen.getByTestId("quickfill-time-tomorrow"));
    fireEvent.changeText(screen.getByLabelText("Reason for visit"), "Check-up");
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ preferredTime: null }), null
      )
    );
  });

  it("leaves the typed text editable after a chip fills it", () => {
    // A shortcut, not a picker: the field is still the user's.
    renderScreen();

    fireEvent.press(screen.getByTestId("quickfill-time-tomorrow"));
    fireEvent.changeText(
      screen.getByLabelText("Preferred time (optional)"),
      "Tomorrow after 3pm"
    );

    expect(screen.getByDisplayValue("Tomorrow after 3pm")).toBeTruthy();
  });

  it("offers reason chips when starting from scratch", async () => {
    renderScreen();

    fireEvent.press(screen.getByTestId("quickfill-reason-prescription-refill"));
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ reasonForVisit: "Prescription refill" }), null
      )
    );
  });

  it("does not offer reason chips when the reason came from the symptom check", () => {
    /*
      ⛔ TAPPING A CHIP REPLACES THE FIELD, AND THE CARRIED-OVER DESCRIPTION IS
      THE ONE THING HERE THE PERSON DID NOT HAVE TO WRITE TWICE.

      A button that silently wiped it would be a trap, and the chips exist for
      somebody starting from an empty box — which this person is not.
    */
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    expect(screen.queryByTestId("quickfill-reason-check-up")).toBeNull();
    // The time chips are still offered: nothing was carried into that field.
    expect(screen.getByTestId("quickfill-time-this-week")).toBeTruthy();
  });

  it("names no symptom or condition in the reason chips", () => {
    /*
      ⛔ THESE ARE VISIT TYPES, NOT CLINICAL VOCABULARY.

      "Follow-up visit" says what kind of appointment somebody wants. The
      moment an option reads "Chest pain", this screen becomes a second
      app-authored clinical vocabulary — on a screen that never had the review
      the symptom picker is still waiting for.
    */
    const clinical = [
      "pain",
      "ache",
      "rash",
      "fever",
      "cough",
      "bleeding",
      "swelling",
      "infection",
      "chest",
      "headache",
    ];

    for (const reason of VISIT_REASONS) {
      for (const word of clinical) {
        expect(reason.toLowerCase()).not.toContain(word);
      }
    }
  });

  it("offers no chip that claims a clinic is available then", () => {
    /*
      ⛔ THE FENCE. CLAUDE.md forbids a slot picker until a real scheduling
      integration exists, because MedHelp has no availability data and any time
      it offered would be invented — and somebody would turn up for it.

      These are words for a preference, so none of them may read as a specific
      bookable moment. A time of day is fine ("Weekday morning"); a clock time
      is not.
    */
    for (const option of PREFERRED_TIMES) {
      expect(option).not.toMatch(/\d{1,2}[:.]\d{2}/);
      expect(option).not.toMatch(/\b\d{1,2}\s*(am|pm)\b/i);
      expect(option.toLowerCase()).not.toContain("available");
      expect(option.toLowerCase()).not.toContain("slot");
    }
  });
});
