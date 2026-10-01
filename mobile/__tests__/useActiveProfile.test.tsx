import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { getActiveProfileId, listProfiles, onProfilesChange } from "@/services/profileService";

jest.mock("@/services/profileService", () => ({
  ...jest.requireActual("@/services/profileService"),
  getActiveProfileId: jest.fn(), listProfiles: jest.fn(), onProfilesChange: jest.fn(),
}));
const stored = getActiveProfileId as jest.Mock;
const list = listProfiles as jest.Mock;
const subscribe = onProfilesChange as jest.Mock;
const person = { id: "synthetic-person", displayName: "Synthetic person" };
let changed: () => void;
const unsubscribe = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  stored.mockReset().mockResolvedValue(null);
  list.mockReset().mockResolvedValue([person]);
  subscribe.mockImplementation((listener: () => void) => { changed = listener; return unsubscribe; });
});

it("keeps the latest selection when an older refresh finishes last", async () => {
  let resolveOld!: (value: null) => void;
  stored.mockReturnValueOnce(new Promise<null>((resolve) => { resolveOld = resolve; }));
  const { result } = renderHook(useActiveProfile);
  expect(result.current.ready).toBe(false);
  stored.mockResolvedValueOnce(person.id);
  act(() => changed());
  await waitFor(() => expect(result.current.profileId).toBe(person.id));
  await act(async () => resolveOld(null));
  expect(result.current.profileId).toBe(person.id);
  expect(result.current.ready).toBe(true);
});

it("preserves the account-holder fallback when the current profile list fails", async () => {
  stored.mockResolvedValue(person.id);
  list.mockRejectedValueOnce(new Error("Synthetic failure"));
  const { result } = renderHook(useActiveProfile);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.profileId).toBeNull();
  expect(result.current.profiles).toEqual([]);
});

it("unsubscribes and ignores a pending refresh after unmount", async () => {
  let resolvePending!: (value: string) => void;
  stored.mockReturnValueOnce(new Promise<string>((resolve) => { resolvePending = resolve; }));
  const { result, unmount } = renderHook(useActiveProfile);
  unmount();
  await act(async () => resolvePending(person.id));
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(result.current.ready).toBe(false);
});
