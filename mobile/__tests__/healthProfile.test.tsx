/**
 * The health profile screen, the account's data rights, and what the visit
 * summary says about allergies. All entries are invented.
 */

jest.mock("@/services/apiClient", () => ({
  ...jest.requireActual("@/services/apiClient"),
  apiRequest: jest.fn(),
}));
jest.mock("@/services/authService", () => ({
  ...jest.requireActual("@/services/authService"),
  logout: jest.fn(async () => undefined),
}));
jest.mock("@/services/emergencyCard", () => ({
  ...jest.requireActual("@/services/emergencyCard"),
  clearCard: jest.fn(async () => undefined),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { HealthProfileScreen } from "@/screens/HealthProfileScreen";
import { apiRequest } from "@/services/apiClient";
import { clearCard } from "@/services/emergencyCard";
import { buildVisitSummary } from "@/services/visitSummary";

const mockApi = apiRequest as jest.MockedFunction<typeof apiRequest>;

function route(responses: Record<string, unknown>) {
  mockApi.mockImplementation(async (path: string, init) => {
    const key = `${init.method} ${path.split("?")[0]}`;
    if (key in responses) return responses[key];
    throw new Error(`unexpected ${key}`);
  });
}

function renderScreen() {
  const navigation = { navigate: jest.fn(), reset: jest.fn() };
  render(<HealthProfileScreen navigation={navigation as never} route={{} as never} />);
  return navigation;
}

beforeEach(() => mockApi.mockReset());

describe("buildVisitSummary: allergies and conditions", () => {
  const preparedOn = new Date("2026-09-22T12:00:00Z");

  it("quotes entries as typed", () => {
    const text = buildVisitSummary({
      assessments: [],
      medications: null,
      healthProfile: { allergies: ["synthetic allergen X"], conditions: ["synthetic condition Y"] },
      preparedOn,
    });
    expect(text).toContain("ALLERGIES I HAVE RECORDED\n- synthetic allergen X");
    expect(text).toContain("CONDITIONS I HAVE RECORDED\n- synthetic condition Y");
  });

  it("⛔ says 'Not recorded', never omits the section or says 'None'", () => {
    const text = buildVisitSummary({
      assessments: [],
      medications: null,
      healthProfile: { allergies: [], conditions: [] },
      preparedOn,
    });
    expect(text).toContain("ALLERGIES I HAVE RECORDED\nNot recorded in MedHelp.");
    expect(text).not.toMatch(/no known allergies|allergies: none/i);
  });

  it("⛔ says a failed load out loud rather than dropping allergies", () => {
    const text = buildVisitSummary({ assessments: [], medications: null, healthProfile: null, preparedOn });
    expect(text).toContain("ALLERGIES I HAVE RECORDED\nCould not be loaded");
  });
});

describe("HealthProfileScreen", () => {
  it("⛔ shows an empty section as 'Not recorded'", async () => {
    route({ "GET /profiles": [], "GET /health-profile": { allergies: [], conditions: [] } });
    renderScreen();

    expect(await screen.findAllByText("Not recorded")).toHaveLength(2);
    expect(screen.queryByText(/^None$/)).toBeNull();
  });

  it("saves text still sitting in a box rather than dropping it", async () => {
    route({
      "GET /profiles": [],
      "GET /health-profile": { allergies: [], conditions: [] },
      "PUT /health-profile": { allergies: ["synthetic allergen X"], conditions: [] },
    });
    renderScreen();
    await screen.findAllByText("Not recorded");

    fireEvent.changeText(screen.getByLabelText("New allergy"), "synthetic allergen X");
    fireEvent.press(screen.getByText("Save health profile"));

    await waitFor(() => {
      const put = mockApi.mock.calls.find(([, init]) => init.method === "PUT");
      expect(JSON.parse(put![1].body as string)).toEqual({
        allergies: ["synthetic allergen X"],
        conditions: [],
      });
    });
    expect(await screen.findByText("synthetic allergen X")).toBeTruthy();
  });

  it("deletes the account only with a password, then clears the device and signs out", async () => {
    route({
      "GET /profiles": [{ id: "p-1", display_name: "Synthetic Grandad" }],
      "GET /health-profile": { allergies: [], conditions: [] },
      "DELETE /account": null,
    });
    const navigation = renderScreen();
    await screen.findAllByText("Not recorded");

    fireEvent.press(screen.getByText("Delete my account"));
    fireEvent.press(screen.getByText("Delete my account and all records"));
    expect(mockApi.mock.calls.some(([, init]) => init.method === "DELETE")).toBe(false);

    fireEvent.changeText(screen.getByLabelText("Your password, to confirm"), "synthetic-pass");
    fireEvent.press(screen.getByText("Delete my account and all records"));

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] }));
    const del = mockApi.mock.calls.find(([, init]) => init.method === "DELETE");
    expect(JSON.parse(del![1].body as string)).toEqual({ password: "synthetic-pass" });
    expect(clearCard).toHaveBeenCalledWith(null);
    expect(clearCard).toHaveBeenCalledWith("p-1");
  });
});
