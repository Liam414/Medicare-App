/** Medication history: what was tapped, and "Not marked" for everything else. Invented data. */

jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  getMedicationHistory: jest.fn(),
  markDose: jest.fn(async () => ({})),
  unmarkDose: jest.fn(async () => undefined),
}));
jest.mock("@/services/reminderService", () => ({
  ...jest.requireActual("@/services/reminderService"),
  listSchedules: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MedicationHistoryScreen } from "@/screens/medications/MedicationHistoryScreen";
import { getMedicationHistory, localDay, markDose } from "@/services/medicationService";
import { listSchedules } from "@/services/reminderService";

const mockHistory = getMedicationHistory as jest.Mock;
const mockSchedules = listSchedules as jest.Mock;

function renderScreen() {
  render(<MedicationHistoryScreen navigation={{} as never} route={{ params: { medicationId: "m-1" } } as never} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSchedules.mockResolvedValue([
    {
      medicationId: "m-1",
      medicationName: "Synthetimol",
      dosage: null,
      frequency: null,
      reminders: [{ id: "r-1", timeOfDay: "08:00", enabled: true }],
    },
  ]);
});

it("⛔ shows untapped times as 'Not marked' and never says missed", async () => {
  mockHistory.mockResolvedValue({ startedOn: null, stoppedOn: null, doses: [], changes: [] });
  renderScreen();

  expect((await screen.findAllByText(/: Not marked$/)).length).toBe(7);
  expect(screen.queryByText(/missed/i)).toBeNull();
  expect(screen.queryByText(/\d+ of \d+|%/)).toBeNull();
});

it("shows what was tapped, and records a tap for today", async () => {
  mockHistory.mockResolvedValue({
    startedOn: "2026-01-02",
    stoppedOn: null,
    doses: [],
    changes: [{ changedAt: "2026-02-01T10:00:00Z", changes: { dosage: ["10 mg", "20 mg"] } }],
  });
  renderScreen();

  expect(await screen.findByText("Dose: 10 mg → 20 mg")).toBeTruthy();
  expect(screen.getByText("Started on: 2026-01-02")).toBeTruthy();

  fireEvent.press(screen.getByText("Taken"));
  await waitFor(() => expect(markDose).toHaveBeenCalledWith("m-1", localDay(), "08:00", "taken"));
});
