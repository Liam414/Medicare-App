import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AppointmentConfirmationScreen } from "@/screens/appointments/AppointmentConfirmationScreen";
import {
  getBookingCapability,
  updateAppointment,
} from "@/services/appointmentService";
import type { Appointment } from "@/services/appointmentService";

jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  getBookingCapability: jest.fn(),
  updateAppointment: jest.fn(),
}));

const mockCapability = getBookingCapability as jest.MockedFunction<
  typeof getBookingCapability
>;
const mockUpdate = updateAppointment as jest.MockedFunction<
  typeof updateAppointment
>;

beforeEach(() => {
  mockCapability.mockReset();
  mockUpdate.mockReset();
  // The standing state: no BAA-covered channel, so no booking.
  mockCapability.mockResolvedValue(false);
});

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appointment-1",
    providerName: "Synthetic Urgent Care",
    providerNpi: "1000000001",
    providerSpecialty: "Clinic/Center, Urgent Care",
    providerPhone: "(212) 555-0143",
    providerAddress: "1 Synthetic Plaza, New York, NY, 10001",
    reasonForVisit: "Sore throat and a fever since Tuesday.",
    preferredTime: "Thursday morning",
    urgencyTier: "URGENT",
    sourceAssessmentId: "assessment-1",
    notes: null,
    status: "REQUESTED",
    providerNotified: false,
    createdAt: "2026-08-29T10:00:00Z",
    ...overrides,
  };
}

function renderScreen(overrides: Partial<Appointment> = {}) {
  const replace = jest.fn();
  const navigate = jest.fn();
  render(
    <AppointmentConfirmationScreen
      navigation={{ replace, navigate } as any}
      route={{ params: { appointment: appointment(overrides) } } as any}
    />
  );
  return { replace, navigate };
}

describe("AppointmentConfirmationScreen", () => {
  it("does not tell the user anything was booked or confirmed", () => {
    // This is the screen most likely to be misread. Nothing has been
    // confirmed: a row exists in MedHelp and the clinic has never heard of it.
    renderScreen();

    expect(screen.queryByText(/confirmed/i)).toBeNull();
    expect(screen.queryByText(/booked/i)).toBeNull();
    expect(screen.getByText("Saved to your appointments")).toBeTruthy();
  });

  it("says in as many words that the provider has not been contacted", () => {
    renderScreen();

    expect(screen.getByText(/has not been contacted/i)).toBeTruthy();
  });

  it("gives calling the clinic as the next step", () => {
    renderScreen();

    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
  });

  it("shows what was saved, including the reason carried from intake", () => {
    renderScreen();

    /*
      `getAllByText`, because the reason and the preferred time each appear
      twice on purpose since the call card was added: once in the record of
      what was saved, and once in "What to tell them" beside the Call button.

      ⛔ That repetition is the feature, not an oversight. This screen is read
      while a receptionist is on the line, and the things you have to say out
      loud belong in one contiguous block next to the button you just pressed
      — not scrolled away at the top under a different heading. If the two ever
      need to diverge, the call card is the one that must keep matching what
      the user actually wrote.
    */
    expect(
      screen.getAllByText("Sore throat and a fever since Tuesday.").length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Thursday morning").length).toBe(2);
    expect(
      screen.getByText("Requested — not yet arranged with the provider")
    ).toBeTruthy();
  });

  it("changes its story only if the provider really was notified", () => {
    // Guards the day a BAA-covered booking channel exists: the screen should
    // then stop under-promising, and until then this branch is unreachable
    // because the server never returns providerNotified true.
    renderScreen({ providerNotified: true });

    expect(screen.getByText("Appointment booked")).toBeTruthy();
    expect(screen.queryByText("Next step")).toBeNull();
  });

  describe("the booking path is gated on the server's answer", () => {
    it("does not offer to send anything while booking is unavailable", async () => {
      // The screen behind this button asks for a legal name, date of birth and
      // home address. While there is nowhere to send them, it must be
      // unreachable — collecting them for no purpose is the failure mode.
      renderScreen();

      await waitFor(() => expect(mockCapability).toHaveBeenCalled());
      expect(screen.queryByText("Send request to provider")).toBeNull();
      expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
    });

    it("offers to send once a channel exists", async () => {
      mockCapability.mockResolvedValue(true);
      renderScreen();

      expect(await screen.findByText("Send request to provider")).toBeTruthy();
    });

    it("passes only an id to the identity form, never a person", async () => {
      mockCapability.mockResolvedValue(true);
      const { navigate } = renderScreen();

      fireEvent.press(await screen.findByText("Send request to provider"));

      expect(navigate).toHaveBeenCalledWith("BookingIdentity", {
        appointmentId: "appointment-1",
        providerName: "Synthetic Urgent Care",
      });
    });

    it("falls back to calling when the capability check fails", async () => {
      mockCapability.mockRejectedValue(new Error("offline"));
      renderScreen();

      await waitFor(() => expect(mockCapability).toHaveBeenCalled());
      expect(screen.queryByText("Send request to provider")).toBeNull();
      expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
    });
  });
});

describe("making the call itself easy", () => {
  it("shows what to say, next to the button that makes the call", () => {
    renderScreen();

    expect(screen.getByText("What to tell them")).toBeTruthy();
    expect(
      screen.getByText(
        "An appointment about: Sore throat and a fever since Tuesday."
      )
    ).toBeTruthy();
    expect(screen.getByText(/soonest they can see you/i)).toBeTruthy();
  });

  it("still gives a script when no reason was written down", () => {
    // Someone who saved an appointment without a reason still has a call to
    // make, and an empty card would be worse than a plain one.
    renderScreen({ reasonForVisit: "" });

    expect(screen.getByText("What to tell them")).toBeTruthy();
    expect(screen.getByText("An appointment")).toBeTruthy();
  });

  it("names no condition and asks nothing clinical", () => {
    /*
      ⛔ THIS CARD IS READ WHILE A RECEPTIONIST IS ON THE LINE.

      That is the worst possible moment to put a clinical suggestion in front
      of somebody. Every line is either what they already wrote, or an
      administrative question about the appointment. Nothing here may suggest
      a question about their condition.
    */
    renderScreen();

    expect(screen.queryByText(/could be/i)).toBeNull();
    expect(screen.queryByText(/you may have/i)).toBeNull();
    expect(screen.queryByText(/ask whether it is/i)).toBeNull();
    expect(screen.queryByText(/tell them you have/i)).toBeNull();
  });

  it("marks the appointment scheduled in one press", async () => {
    mockUpdate.mockResolvedValue(appointment({ status: "SCHEDULED" }));
    renderScreen();

    fireEvent.press(screen.getByText("I've arranged a time"));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "appointment-1",
        expect.objectContaining({ status: "SCHEDULED" })
      )
    );
    expect(await screen.findByText(/marked as scheduled/i)).toBeTruthy();
  });

  it("carries the reason and notes through rather than blanking them", async () => {
    /*
      ⛔ `updateAppointment` sends null for anything omitted.

      Marking a status while silently dropping the preferred time and the note
      the person typed one screen ago would lose their own words to a
      convenience button — the exact opposite of what this button is for.
    */
    mockUpdate.mockResolvedValue(appointment({ status: "SCHEDULED" }));
    renderScreen({ notes: "Ask about the referral." });

    fireEvent.press(screen.getByText("I've arranged a time"));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("appointment-1", {
        status: "SCHEDULED",
        preferredTime: "Thursday morning",
        notes: "Ask about the referral.",
      })
    );
  });

  it("reports a failure as a failure, and offers the list instead", async () => {
    mockUpdate.mockRejectedValue(new Error("network"));
    renderScreen();

    fireEvent.press(screen.getByText("I've arranged a time"));

    expect(
      await screen.findByText(/couldn't update this appointment/i)
    ).toBeTruthy();
    // And it must not claim success.
    expect(screen.queryByText(/marked as scheduled/i)).toBeNull();
  });

  it("does not claim MedHelp arranged anything", async () => {
    /*
      The status records that the USER arranged a time by telephone. MedHelp
      contacted nobody, and this screen's whole job is to keep that
      unambiguous — a list is skimmed, and whether the clinic knows is the one
      thing a person must not misread.
    */
    mockUpdate.mockResolvedValue(appointment({ status: "SCHEDULED" }));
    renderScreen();

    fireEvent.press(screen.getByText("I've arranged a time"));
    await screen.findByText(/marked as scheduled/i);

    expect(screen.queryByText(/we have booked/i)).toBeNull();
    expect(screen.queryByText(/medhelp booked/i)).toBeNull();
    expect(screen.queryByText(/has received your request/i)).toBeNull();
  });
});
