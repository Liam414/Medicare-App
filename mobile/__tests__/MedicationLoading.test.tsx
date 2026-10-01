import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { MedicationListScreen } from "@/screens/medications/MedicationListScreen";
import { listMedications, type Medication } from "@/services/medicationService";
import { mirrorMedications } from "@/services/emergencyCard";

let mockProfileId: string | null = null;
jest.mock("@/hooks/useActiveProfile", () => ({
  useActiveProfile: () => ({
    active: mockProfileId ? { id: mockProfileId, displayName: "Synthetic person" } : null,
    profiles: [], ready: true, profileId: mockProfileId,
  }),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}));
jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"), listMedications: jest.fn(),
}));
jest.mock("@/services/appSettings", () => ({ getRefillLeadDays: jest.fn(async () => 7) }));
jest.mock("@/services/emergencyCard", () => ({ mirrorMedications: jest.fn() }));

const list = listMedications as jest.Mock;
const navigation = { navigate: jest.fn(), reset: jest.fn() } as any;
const view = () => <MedicationListScreen navigation={navigation} route={{} as any} />;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function medication(name: string): Medication {
  return {
    id: name, name, dosage: null, frequency: null, prescribingDoctor: null,
    refillDate: null, notes: null, quantityRemaining: null, quantityCountedOn: null,
    dosesPerDay: null, refillDueSoon: false, refillOverdue: false, daysUntilRefill: null,
    refillEstimate: { runOutOn: null, daysRemaining: null, alert: false, isEstimate: true,
      dosesPerDay: null, dosesPerDaySource: null, reason: null, leadDays: 7 },
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockProfileId = null;
  list.mockReset().mockResolvedValue([]);
});

it("hides the previous person's list while the next list loads", async () => {
  list.mockResolvedValueOnce([medication("Synthetic owner medicine")]);
  const { rerender } = render(view());
  await screen.findByText("Synthetic owner medicine");
  const next = deferred<Medication[]>();
  list.mockReturnValueOnce(next.promise);
  mockProfileId = "other";
  rerender(view());
  expect(screen.queryByText("Synthetic owner medicine")).toBeNull();
  expect(screen.getByText("Loading your medications…")).toBeTruthy();
  await act(async () => next.resolve([medication("Synthetic other medicine")]));
  expect(screen.getByText("Synthetic other medicine")).toBeTruthy();
});

it("ignores an obsolete successful request and does not mirror its records", async () => {
  const old = deferred<Medication[]>();
  list.mockReturnValueOnce(old.promise);
  const { rerender } = render(view());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  mockProfileId = "other";
  list.mockResolvedValueOnce([medication("Synthetic other medicine")]);
  rerender(view());
  await screen.findByText("Synthetic other medicine");
  await act(async () => old.resolve([medication("Synthetic owner medicine")]));
  expect(screen.queryByText("Synthetic owner medicine")).toBeNull();
  expect(screen.getByText("Synthetic other medicine")).toBeTruthy();
  expect(mirrorMedications).toHaveBeenCalledTimes(1);
  expect(mirrorMedications).toHaveBeenCalledWith([medication("Synthetic other medicine")], "other");
});

it("does not let an obsolete failure hide the selected person's list", async () => {
  const old = deferred<Medication[]>();
  list.mockReturnValueOnce(old.promise);
  const { rerender } = render(view());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  mockProfileId = "other";
  list.mockResolvedValueOnce([medication("Synthetic other medicine")]);
  rerender(view());
  await screen.findByText("Synthetic other medicine");
  await act(async () => old.reject(new Error("Synthetic failure")));
  expect(screen.getByText("Synthetic other medicine")).toBeTruthy();
  expect(screen.queryByText(/Something stopped/)).toBeNull();
});

it("offers retry after a server failure without claiming the list is empty", async () => {
  list.mockRejectedValueOnce(new Error("Synthetic failure"));
  render(view());
  await screen.findByText("Something stopped your medications loading. Please try again.");
  expect(screen.queryByText("No medications yet")).toBeNull();
  fireEvent.press(screen.getByText("Try again"));
  await screen.findByText("No medications yet");
  expect(screen.queryByText(/Something stopped/)).toBeNull();
});

it("does not mirror an outstanding response after leaving the screen", async () => {
  const pending = deferred<Medication[]>();
  list.mockReturnValueOnce(pending.promise);
  const { unmount } = render(view());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => pending.resolve([medication("Synthetic medicine")]));
  expect(mirrorMedications).not.toHaveBeenCalled();
});
