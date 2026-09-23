import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SymptomHistoryScreen } from "@/screens/intake/SymptomHistoryScreen";
import { VisitSummaryScreen } from "@/screens/intake/VisitSummaryScreen";
import {
  deletePastAssessment,
  listPastAssessments,
  type PastAssessment,
} from "@/services/intakeService";
import { listMedications, type Medication } from "@/services/medicationService";
import { SUMMARY_PREAMBLE, buildVisitSummary, shareSummary } from "@/services/visitSummary";

jest.mock("@/services/intakeService", () => ({
  ...jest.requireActual("@/services/intakeService"),
  listPastAssessments: jest.fn(),
  deletePastAssessment: jest.fn(),
}));
jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  listMedications: jest.fn(),
}));
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

const mockList = listPastAssessments as jest.MockedFunction<typeof listPastAssessments>;
const mockDelete = deletePastAssessment as jest.MockedFunction<typeof deletePastAssessment>;
const mockMeds = listMedications as jest.MockedFunction<typeof listMedications>;

function past(overrides: Partial<PastAssessment> = {}): PastAssessment {
  return {
    id: "past-1",
    createdAt: "2026-09-20T09:30:00Z",
    tier: "URGENT",
    reasoning: "Synthetic reasoning.",
    description: "synthetic ache behind my left knee. since sunday",
    summary: { understood: [{ label: "Where", value: "synthetic left knee" }], unclear: ["How long"] },
    ...overrides,
  };
}

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Synthetimol",
    dosage: "10 mg",
    frequency: "TAKE 1 TABLET BY MOUTH TWICE DAILY",
    prescribingDoctor: "Dr Synthetic",
    refillDate: null,
    notes: "synthetic private note",
    quantityRemaining: null,
    quantityCountedOn: null,
    dosesPerDay: null,
    ...overrides,
  } as Medication;
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([past()]);
  mockDelete.mockReset().mockResolvedValue();
  mockMeds.mockReset().mockResolvedValue([medication()]);
});

describe("buildVisitSummary", () => {
  const preparedOn = new Date("2026-09-22T12:00:00Z");

  it("copies the person's words and answers verbatim", () => {
    const text = buildVisitSummary({ assessments: [past()], medications: null, preparedOn });

    expect(text).toContain('"synthetic ache behind my left knee. since sunday"');
    expect(text).toContain("Where: synthetic left knee");
    expect(text).toContain("Not answered: How long");
  });

  it("carries directions exactly as printed and never decodes them", () => {
    const text = buildVisitSummary({ assessments: [], medications: [medication()], preparedOn });

    expect(text).toContain('Synthetimol — 10 mg — "TAKE 1 TABLET BY MOUTH TWICE DAILY"');
    expect(text).not.toMatch(/twice a day|08:00|20:00/i);
  });

  it("leaves out fields a clinician did not ask for", () => {
    const text = buildVisitSummary({ assessments: [], medications: [medication()], preparedOn });

    expect(text).not.toContain("synthetic private note");
    expect(text).not.toContain("Dr Synthetic");
  });

  it("says no medications are recorded rather than omitting the section", () => {
    // A missing section reads as "takes nothing".
    const text = buildVisitSummary({ assessments: [], medications: [], preparedOn });

    expect(text).toContain("None recorded in MedHelp.");
  });

  it("always says the estimates are not diagnoses", () => {
    const text = buildVisitSummary({ assessments: [past()], medications: null, preparedOn });

    expect(text).toContain(SUMMARY_PREAMBLE);
    expect(SUMMARY_PREAMBLE).toMatch(/not diagnoses/);
  });

  it("puts the history in reading order, oldest first", () => {
    const text = buildVisitSummary({
      assessments: [
        past({ id: "b", description: "synthetic newer" }),
        past({ id: "a", description: "synthetic older" }),
      ],
      medications: null,
      preparedOn,
    });

    expect(text.indexOf("synthetic older")).toBeLessThan(text.indexOf("synthetic newer"));
  });
});

describe("shareSummary", () => {
  it("never reports sharing when the sheet was dismissed", async () => {
    const outcome = await shareSummary("x", async () => ({ action: "dismissedAction" }));
    expect(outcome).toBe("dismissed");
  });

  it("falls back to the clipboard where there is no share sheet", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
    });

    let outcome: string;
    try {
      outcome = await shareSummary("summary text", async () => {
        throw new Error("no share sheet");
      });
    } finally {
      if (original) Object.defineProperty(globalThis, "navigator", original);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("summary text");
  });
});

describe("SymptomHistoryScreen", () => {
  it("shows each saved description verbatim beside the estimate it was given", async () => {
    render(<SymptomHistoryScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} />);

    expect(await screen.findByText("synthetic ache behind my left knee. since sunday")).toBeTruthy();
    expect(screen.getByText("MedHelp's estimate: Urgent — be seen soon")).toBeTruthy();
  });

  it("removes a description when asked", async () => {
    render(<SymptomHistoryScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} />);

    fireEvent.press(await screen.findByText("Remove"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("past-1"));
    await waitFor(() =>
      expect(screen.queryByText("synthetic ache behind my left knee. since sunday")).toBeNull()
    );
  });

  it("offers the visit summary", async () => {
    const navigate = jest.fn();
    render(<SymptomHistoryScreen navigation={{ navigate } as any} route={{} as any} />);

    fireEvent.press(await screen.findByText("Make a visit summary"));

    expect(navigate).toHaveBeenCalledWith("VisitSummary");
  });

  it("never counts or groups what someone described", async () => {
    mockList.mockResolvedValue([past(), past({ id: "past-2" })]);
    render(<SymptomHistoryScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} />);

    await screen.findAllByText("Remove");
    expect(screen.queryByText(/\d+ times|pattern|trend/i)).toBeNull();
  });
});

describe("VisitSummaryScreen", () => {
  it("previews exactly the text that will be shared, and a toggle says its state", async () => {
    render(<VisitSummaryScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} />);

    const include = await screen.findByLabelText(/Urgent — be seen soon, included/);
    // The preview is the whole summary text, preamble included.
    expect(await screen.findByText(/^MedHelp visit summary[\s\S]*synthetic ache behind my left knee/)).toBeTruthy();

    fireEvent.press(include);

    expect(await screen.findByLabelText(/Urgent — be seen soon, not included/)).toBeTruthy();
  });
});
