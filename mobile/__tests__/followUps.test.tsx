/** Follow-ups, readings and targets. Invented data. */

jest.mock("@/hooks/useActiveProfile", () => ({
  useActiveProfile: () => ({ active: null, profiles: [], ready: true, profileId: null, refresh: jest.fn() }),
}));
jest.mock("@/services/apiClient", () => ({
  ...jest.requireActual("@/services/apiClient"),
  apiRequest: jest.fn(),
}));
jest.mock("@/services/reminderArming", () => ({ rearm: jest.fn(async () => null) }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { FollowUpsScreen } from "@/screens/FollowUpsScreen";
import { ReadingsScreen } from "@/screens/ReadingsScreen";
import { apiRequest } from "@/services/apiClient";
import { FOLLOW_UP_ALERT_BODY, toFollowUpAlerts, type FollowUp } from "@/services/followUpService";
import { localDay } from "@/services/medicationService";

const mockApi = apiRequest as jest.MockedFunction<typeof apiRequest>;
const nav = { navigate: jest.fn() } as never;

beforeEach(() => mockApi.mockReset());

describe("toFollowUpAlerts", () => {
  const item = (dueOn: string, doneOn: string | null = null): FollowUp => ({
    id: dueOn,
    kind: "return_visit",
    title: "Back to Dr Synthetic about my knee",
    dueOn,
    doneOn,
  });

  it("fires at 09:00 local on the due day, future and open only, and says nothing clinical", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    const alerts = toFollowUpAlerts([item("2026-09-30"), item("2026-09-20"), item("2026-10-01", "2026-09-22")], now);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].fireAt).toEqual(new Date(2026, 8, 30, 9, 0, 0));
    expect(alerts[0].body).toBe(FOLLOW_UP_ALERT_BODY);
    expect(alerts[0].body).not.toMatch(/knee|Dr/);
  });
});

describe("FollowUpsScreen", () => {
  it("adds a follow-up in the person's words and marks one done", async () => {
    const existing = { id: "f1", kind: "other", title: "Book blood test", due_on: localDay(), done_on: null };
    mockApi.mockImplementation(async (path: string, init) => {
      if (init.method === "GET") return [existing];
      if (init.method === "POST") return { ...existing, id: "f2" };
      if (init.method === "PATCH") return { ...existing, done_on: localDay() };
      throw new Error(path);
    });
    render(<FollowUpsScreen navigation={nav} route={{} as never} />);

    expect(await screen.findByText(/Due today/)).toBeTruthy();
    fireEvent.press(screen.getByText("Mark done"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/follow-ups/f1", expect.objectContaining({ method: "PATCH" }))
    );

    fireEvent.changeText(screen.getByLabelText("What is it?"), "Back to Dr Synthetic");
    fireEvent.press(screen.getByText("In 2 weeks"));
    fireEvent.press(screen.getByText("Add follow-up"));
    await waitFor(() => {
      const post = mockApi.mock.calls.find(([, init]) => init.method === "POST");
      expect(JSON.parse(post![1].body as string)).toMatchObject({ kind: "return_visit", title: "Back to Dr Synthetic" });
    });
  });
});

describe("ReadingsScreen", () => {
  it("⛔ shows the target verbatim beside readings and never judges them", async () => {
    mockApi.mockImplementation(async (_path: string, init) => {
      if (init.method === "GET")
        return {
          summaries: [
            { kind: "blood_pressure", target_text: "130/80 from Dr Synthetic", remind_every_days: 3, last_taken_on: null, due: true, days_since: null },
          ],
          readings: [{ id: "r", kind: "blood_pressure", taken_on: "2026-09-20", value: { systolic: 190, diastolic: 120, unit: "mmHg" } }],
        };
      return {};
    });
    render(<ReadingsScreen navigation={nav} route={{} as never} />);

    expect(await screen.findByText("Your target: 130/80 from Dr Synthetic")).toBeTruthy();
    expect(screen.getByText("2026-09-20: 190/120 mmHg")).toBeTruthy();
    expect(screen.getByText(/No reading logged yet\. You asked to be reminded every 3 days\./)).toBeTruthy();
    expect(screen.queryByText(/\b(high|low|normal|above|below|on target|off target)\b/i)).toBeNull();

    fireEvent.changeText(screen.getByLabelText("Top number"), "128");
    fireEvent.changeText(screen.getByLabelText("Bottom number"), "82");
    fireEvent.press(screen.getByText("Save reading"));
    await waitFor(() => {
      const post = mockApi.mock.calls.find(([, init]) => init.method === "POST");
      expect(JSON.parse(post![1].body as string)).toEqual({
        kind: "blood_pressure",
        systolic: 128,
        diastolic: 82,
        taken_on: localDay(),
      });
    });
  });
});
