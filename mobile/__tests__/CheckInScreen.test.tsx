/** Daily check-ins: answered in a tap, shown back without interpretation. Invented data. */

jest.mock("@/hooks/useActiveProfile", () => ({
  useActiveProfile: () => ({ active: null, profiles: [], ready: true, profileId: null, refresh: jest.fn() }),
}));
jest.mock("@/services/dailyCheckIns", () => ({
  ...jest.requireActual("@/services/dailyCheckIns"),
  listDailyCheckIns: jest.fn(async () => []),
  recordDailyCheckIn: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { CheckInScreen } from "@/screens/CheckInScreen";
import { listDailyCheckIns, recordDailyCheckIn } from "@/services/dailyCheckIns";
import { localDay } from "@/services/medicationService";

const mockRecord = recordDailyCheckIn as jest.Mock;

function renderScreen() {
  const navigation = { navigate: jest.fn() };
  render(<CheckInScreen navigation={navigation as never} route={{} as never} />);
  return navigation;
}

beforeEach(() => jest.clearAllMocks());

it("records the choice and a note for today", async () => {
  mockRecord.mockResolvedValue({ id: "c", day: localDay(), feeling: "same", note: "x", suggestSymptomCheck: false });
  renderScreen();

  fireEvent.press(screen.getByLabelText("About the same, not selected"));
  fireEvent.changeText(screen.getByLabelText("Anything to add? (optional)"), "synthetic note");
  fireEvent.press(screen.getByText("Save check-in"));

  await waitFor(() => expect(mockRecord).toHaveBeenCalledWith(null, localDay(), "same", "synthetic note"));
  expect(await screen.findByText("Saved for today.")).toBeTruthy();
});

it("offers a new symptom check when things are worse", async () => {
  mockRecord.mockResolvedValue({ id: "c", day: localDay(), feeling: "worse", note: null, suggestSymptomCheck: true });
  const navigation = renderScreen();

  fireEvent.press(screen.getByLabelText("Worse, not selected"));
  fireEvent.press(screen.getByText("Save check-in"));
  fireEvent.press(await screen.findByText("Check my symptoms"));

  expect(navigation.navigate).toHaveBeenCalledWith("SymptomIntake");
});

it("⛔ draws the trend with labels and no interpretation", async () => {
  (listDailyCheckIns as jest.Mock).mockResolvedValue([
    { id: "a", day: localDay(), feeling: "worse", note: null, suggestSymptomCheck: true },
  ]);
  renderScreen();

  expect(await screen.findByLabelText(`${localDay()}: Worse`)).toBeTruthy();
  expect(screen.queryByText(/improv|streak|\d+ of \d+|%|score/i)).toBeNull();
});
