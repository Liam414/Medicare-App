/**
 * Care profiles on the device: whose records are on screen, and keeping one
 * person's apart from another's. Names are invented.
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
  };
});
jest.mock("@/services/apiClient", () => ({
  ...jest.requireActual("@/services/apiClient"),
  apiRequest: jest.fn(),
}));
jest.mock("@/services/reminderArming", () => ({ rearm: jest.fn(async () => null) }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ProfileBanner } from "@/components/ProfileBanner";
import { CareProfilesScreen } from "@/screens/CareProfilesScreen";
import { apiRequest } from "@/services/apiClient";
import { EMPTY_CARD, loadCard, saveCard } from "@/services/emergencyCard";
import {
  getStoredActiveProfile,
  resolveActive,
  setActiveProfile,
} from "@/services/profileService";
import { toDueReminders } from "@/services/reminderService";

const mockApi = apiRequest as jest.MockedFunction<typeof apiRequest>;
const GRANDAD = { id: "p-1", displayName: "Synthetic Grandad" };

beforeEach(async () => {
  mockApi.mockReset();
  await setActiveProfile(null);
});

describe("ProfileBanner", () => {
  it("renders nothing for someone who manages only themselves", () => {
    render(<ProfileBanner active={null} profiles={[]} onChange={jest.fn()} />);
    expect(screen.queryByText(/Showing records for/)).toBeNull();
  });

  it("says whose records are shown, and says 'Me' for your own", () => {
    render(<ProfileBanner active={null} profiles={[GRANDAD]} onChange={jest.fn()} />);
    expect(screen.getByText("Me")).toBeTruthy();
    expect(screen.getByLabelText(/Currently Me/)).toBeTruthy();
  });
});

describe("the active profile", () => {
  it("⛔ never trusts a stored id this account does not have", () => {
    // Deleted, or another account's, on a shared device.
    expect(resolveActive("someone-elses", [GRANDAD])).toBeNull();
    expect(resolveActive("p-1", [GRANDAD])).toEqual(GRANDAD);
  });

  it("is kept on the device with its name, so the card needs no network", async () => {
    await setActiveProfile(GRANDAD);
    expect(await getStoredActiveProfile()).toEqual(GRANDAD);
  });
});

describe("one emergency card per person", () => {
  it("keeps Grandad's card apart from the owner's", async () => {
    await saveCard({ ...EMPTY_CARD, allergies: "synthetic owner allergy" });
    await saveCard({ ...EMPTY_CARD, allergies: "synthetic grandad allergy" }, GRANDAD.id);

    expect((await loadCard()).allergies).toBe("synthetic owner allergy");
    expect((await loadCard(GRANDAD.id)).allergies).toBe("synthetic grandad allergy");
  });
});

describe("reminder notifications", () => {
  it("say whose medicine it is when it is not the owner's", () => {
    const reminders = toDueReminders([
      {
        medicationId: "m-1",
        medicationName: "Synthetimol",
        dosage: "10 mg",
        frequency: null,
        profileName: "Synthetic Grandad",
        reminders: [{ id: "r-1", timeOfDay: "08:00", enabled: true } as any],
      },
      {
        medicationId: "m-2",
        medicationName: "Placebofen",
        dosage: null,
        frequency: null,
        reminders: [{ id: "r-2", timeOfDay: "09:00", enabled: true } as any],
      },
    ]);

    expect(reminders.map((r) => r.medicationName)).toEqual([
      "For Synthetic Grandad: Synthetimol",
      "Placebofen",
    ]);
  });
});

describe("CareProfilesScreen", () => {
  function renderScreen() {
    const goBack = jest.fn();
    render(<CareProfilesScreen navigation={{ goBack, navigate: jest.fn() } as any} route={{} as any} />);
    return { goBack };
  }

  it("says in each option's label whether it is the one shown", async () => {
    mockApi.mockResolvedValue([{ id: "p-1", display_name: "Synthetic Grandad" }]);
    renderScreen();

    expect(await screen.findByLabelText("Me, selected")).toBeTruthy();
    expect(screen.getByLabelText("Synthetic Grandad, not selected")).toBeTruthy();
  });

  it("⛔ asks before removing someone, and says what goes with them", async () => {
    mockApi.mockResolvedValue([{ id: "p-1", display_name: "Synthetic Grandad" }]);
    renderScreen();

    fireEvent.press(await screen.findByText("Remove Synthetic Grandad"));

    expect(screen.getByText(/deletes Synthetic Grandad's medications, reminder times/)).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalledWith("/profiles/p-1", expect.anything());

    fireEvent.press(screen.getByText("Remove Synthetic Grandad and their records"));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/profiles/p-1",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("choosing someone makes them the one shown", async () => {
    mockApi.mockResolvedValue([{ id: "p-1", display_name: "Synthetic Grandad" }]);
    const { goBack } = renderScreen();

    fireEvent.press(await screen.findByLabelText("Synthetic Grandad, not selected"));

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(await getStoredActiveProfile()).toEqual(GRANDAD);
  });
});
