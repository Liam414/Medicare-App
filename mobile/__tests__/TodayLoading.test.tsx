import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { TodayScreen } from "@/screens/TodayScreen";
import { listMedications } from "@/services/medicationService";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { listSchedules } from "@/services/reminderService";

let mockProfileId: string | null = null;
jest.mock("@/hooks/useActiveProfile", () => ({
  useActiveProfile: () => ({
    active: mockProfileId ? { id: mockProfileId, displayName: "Synthetic person" } : null,
    profiles: [{ id: "other", displayName: "Synthetic person" }],
    ready: true,
    profileId: mockProfileId,
  }),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}));
jest.mock("@/services/authService", () => ({ logout: jest.fn() }));
jest.mock("@/services/checkIns", () => ({ getCheckIn: jest.fn(async () => null) }));
jest.mock("@/services/medicationService", () => ({ listMedications: jest.fn() }));
jest.mock("@/services/appointmentService", () => ({ listAppointments: jest.fn() }));
jest.mock("@/services/reminderService", () => ({ listSchedules: jest.fn() }));
jest.mock("@/services/reminderArming", () => ({ rearm: jest.fn() }));

const medications = listMedications as jest.Mock;
const appointments = listAppointments as jest.Mock;
const schedules = listSchedules as jest.Mock;
const navigation = { navigate: jest.fn(), reset: jest.fn() } as any;
const view = () => <TodayScreen navigation={navigation} route={{} as any} />;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function visit(name: string): Appointment {
  return {
    id: name, providerName: name, providerNpi: null, providerSpecialty: null,
    providerPhone: null, providerAddress: null, reasonForVisit: "Synthetic test",
    preferredTime: null, urgencyTier: null, sourceAssessmentId: null, notes: null,
    status: "REQUESTED", providerNotified: false, createdAt: "2026-09-01T12:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfileId = null;
  medications.mockResolvedValue([]);
  appointments.mockResolvedValue([]);
  schedules.mockResolvedValue([]);
});

it("does not call an unloaded or failed reminder list empty", async () => {
  const pending = deferred<never[]>();
  schedules.mockReturnValueOnce(pending.promise);
  const { unmount } = render(view());
  expect(screen.getByText("Loading reminder times…")).toBeTruthy();
  expect(screen.queryByText("No reminder times set")).toBeNull();
  await act(async () => pending.resolve([]));
  expect(screen.getByText("No reminder times set")).toBeTruthy();
  unmount();

  schedules.mockRejectedValueOnce(new Error("offline"));
  render(view());
  await screen.findByText("Reminder times unavailable");
  expect(screen.queryByText("No reminder times set")).toBeNull();
});

it("hides the previous person's records immediately while the new request is pending", async () => {
  appointments.mockResolvedValueOnce([visit("Synthetic owner clinic")]);
  const { rerender } = render(view());
  await screen.findByText("Synthetic owner clinic");
  const pending = deferred<Appointment[]>();
  appointments.mockReturnValueOnce(pending.promise);
  mockProfileId = "other";
  rerender(view());
  expect(screen.queryByText("Synthetic owner clinic")).toBeNull();
  await act(async () => pending.resolve([visit("Synthetic other clinic")]));
  expect(screen.getByText("Synthetic other clinic")).toBeTruthy();
});

it("ignores a slow response for a profile that is no longer selected", async () => {
  const oldRequest = deferred<Appointment[]>();
  appointments.mockReturnValueOnce(oldRequest.promise);
  const { rerender } = render(view());
  appointments.mockResolvedValueOnce([visit("Synthetic other clinic")]);
  mockProfileId = "other";
  rerender(view());
  await screen.findByText("Synthetic other clinic");
  await act(async () => oldRequest.resolve([visit("Synthetic owner clinic")]));
  expect(screen.getByText("Synthetic other clinic")).toBeTruthy();
  expect(screen.queryByText("Synthetic owner clinic")).toBeNull();
});

it("retains same-person records on a failed retry but says they may be out of date", async () => {
  appointments.mockResolvedValueOnce([visit("Synthetic saved clinic")]);
  schedules.mockRejectedValueOnce(new Error("offline"));
  render(view());
  await screen.findByText("Synthetic saved clinic");
  appointments.mockRejectedValueOnce(new Error("offline"));
  fireEvent.press(screen.getByText("Try again"));
  await waitFor(() => expect(screen.getByText(/Previously loaded information may be out of date/)).toBeTruthy());
  expect(screen.getByText("Synthetic saved clinic")).toBeTruthy();
  expect(screen.queryByText(/What's shown below is up to date/)).toBeNull();
});
