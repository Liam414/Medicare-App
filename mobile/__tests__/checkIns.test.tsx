/**
 * Check-ins: one pending "how is it now?" held on the device.
 *
 * All descriptions are invented.
 */

jest.mock("@/services/deviceStorage", () => {
  const store = new Map<string, string>();
  return {
    readRaw: jest.fn(async (key: string) => store.get(key) ?? null),
    writeRaw: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeRaw: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});
jest.mock("@/services/notificationService", () => ({
  scheduleAll: jest.fn(async () => {}),
  getPermission: jest.fn(() => "granted"),
  requestPermission: jest.fn(async () => "granted"),
  supportsBackgroundDelivery: jest.fn(() => true),
}));
jest.mock("@/services/appSettings", () => ({ getRefillLeadDays: jest.fn(async () => 3) }));
jest.mock("@/services/medicationService", () => ({ listMedications: jest.fn(async () => []) }));
jest.mock("@/services/reminderService", () => ({
  listSchedules: jest.fn(async () => []),
  toDueReminders: () => [],
}));
jest.mock("@/services/intakeService", () => ({
  ...jest.requireActual("@/services/intakeService"),
  reportAssessmentWrong: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { IntakeResultScreen } from "@/screens/intake/IntakeResultScreen";
import {
  CHECK_IN_BODY,
  CHECK_IN_TITLE,
  MAX_STORED_DESCRIPTION,
  clearCheckIn,
  getCheckIn,
  isDue,
  setCheckIn,
  toCheckInAlerts,
} from "@/services/checkIns";
import type { IntakeAssessment } from "@/services/intakeService";
import { scheduleAll } from "@/services/notificationService";
import { rearm } from "@/services/reminderArming";

const mockSchedule = scheduleAll as jest.MockedFunction<typeof scheduleAll>;

const NOW = new Date("2026-09-22T10:00:00");
const DESCRIPTION = "synthetic sore knee since the weekend";

beforeEach(async () => {
  await clearCheckIn();
  mockSchedule.mockClear();
});

describe("checkIns", () => {
  it("is due a day later, and schedules nothing once it is due", async () => {
    const checkIn = await setCheckIn(DESCRIPTION, "URGENT", NOW);

    expect(isDue(checkIn, NOW)).toBe(false);
    expect(isDue(checkIn, new Date("2026-09-23T10:00:00"))).toBe(true);
    expect(toCheckInAlerts(checkIn, new Date("2026-09-23T10:01:00"))).toEqual([]);
  });

  it("⛔ never puts the description, or any symptom, in the notification", async () => {
    const checkIn = await setCheckIn(DESCRIPTION, "URGENT", NOW);
    const [alert] = toCheckInAlerts(checkIn, NOW);

    expect(alert.title).toBe(CHECK_IN_TITLE);
    expect(alert.body).toBe(CHECK_IN_BODY);
    expect(`${alert.title} ${alert.body}`).not.toContain("knee");
  });

  it("keeps no shortened copy of a long description", async () => {
    // Shortening someone's words and prefilling them later would put text in
    // the box they did not write in that form.
    const long = "x".repeat(MAX_STORED_DESCRIPTION + 1);
    const checkIn = await setCheckIn(long, "SELF_CARE", NOW);

    expect(checkIn.description).toBeNull();
    expect((await getCheckIn())?.description).toBeNull();
  });

  it("holds one check-in at a time", async () => {
    await setCheckIn("synthetic first", "URGENT", NOW);
    await setCheckIn("synthetic second", "SELF_CARE", NOW);

    expect((await getCheckIn())?.description).toBe("synthetic second");
  });

  it("is armed in the same call as everything else", async () => {
    // cancelAll cannot tell one notification type from another, so a check-in
    // armed separately would be cancelled by the next dose-reminder arm.
    await setCheckIn(DESCRIPTION, "URGENT", new Date());

    await rearm();

    const options = mockSchedule.mock.calls.at(-1)?.[1];
    expect(options?.checkIns).toHaveLength(1);
    expect(options?.refillAlerts).toEqual([]);
  });
});

function assessment(tier: IntakeAssessment["tier"]): IntakeAssessment {
  return {
    status: "assessed",
    id: null,
    tier,
    reasoning: "Synthetic reasoning.",
    redFlagMatch: tier === "EMERGENT",
    escalatedBySafetyNet: false,
    emergency: null,
    relatedTopics: [],
    topicsSourceNote: null,
    topicsDisabled: true,
    interpretation: null,
    interpretationModel: null,
    modelLayerConfigured: false,
    summary: null,
    disclaimer: "Synthetic disclaimer. Not a diagnosis.",
    escalationGuidance: "Synthetic escalation guidance.",
  };
}

function renderResult(tier: IntakeAssessment["tier"]) {
  render(
    <IntakeResultScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any}
      route={{ params: { assessment: assessment(tier), description: DESCRIPTION } } as any}
    />
  );
}

describe("IntakeResultScreen check-in offer", () => {
  it("offers a check-in on an URGENT result and stores it when pressed", async () => {
    renderResult("URGENT");

    fireEvent.press(screen.getByText("Check in with me tomorrow"));

    await waitFor(async () => expect((await getCheckIn())?.earlierTier).toBe("URGENT"));
    expect((await getCheckIn())?.description).toBe(DESCRIPTION);
    expect(await screen.findByText(/MedHelp will ask how you are feeling/)).toBeTruthy();
  });

  it("offers one on SELF_CARE too", () => {
    renderResult("SELF_CARE");
    expect(screen.getByText("Check in with me tomorrow")).toBeTruthy();
  });

  it("⛔ never offers one beside emergency guidance", () => {
    renderResult("EMERGENT");
    expect(screen.queryByText("Check in with me tomorrow")).toBeNull();
    expect(screen.queryByText("Check in later")).toBeNull();
  });
});
