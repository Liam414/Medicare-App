/**
 * `apiRequest`, the request path almost everything uses.
 *
 * ⛔ WHY THIS FILE DID NOT EXIST AND SHOULD HAVE.
 *
 * `docs/security.md` says "A 401 clears the store, in all three request paths
 * (`apiClient`, `medicationService`, `intakeService`)". It is implemented in
 * all three and, until now, tested in two: `medicationService.test.ts` and
 * `intakeService.test.ts` each assert their own copy, and nothing asserted
 * this one.
 *
 * That is the wrong two. `medicationService` and `intakeService` own their own
 * `fetch`; `apiClient` is what goals, providers, appointments and reminders all
 * go through, so it is the copy whose removal would strand the most sessions.
 * Deleting `void logout()` from here would have left every suite green.
 *
 * What a stale token costs: `restoreSession()` reads it back on the next
 * launch, `RootNavigator` opens on Home because a token exists, and the first
 * request fails. The person is looking at a signed-in app that cannot load
 * anything, with no obvious way to reach the sign-in screen.
 */

import { getToken, logout } from "@/services/authService";
import { ApiError, apiRequest } from "@/services/apiClient";

jest.mock("@/services/authService", () => ({
  getToken: jest.fn(),
  logout: jest.fn(async () => undefined),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

function respond(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("apiRequest", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
    mockedGetToken.mockReturnValue("synthetic-token");
  });

  it("returns the parsed body on success", async () => {
    respond(200, { ok: true });

    await expect(
      apiRequest("/goals", { fallbackMessage: "unused" })
    ).resolves.toEqual({ ok: true });
  });

  it("⛔ drops the refused token on a 401", async () => {
    respond(401, { detail: "Sign in to continue." });

    const error = (await apiRequest("/goals", {
      fallbackMessage: "unused",
    }).catch((caught: ApiError) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isAuthError).toBe(true);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/session has expired/i);
    // The point of the test. A token the server has refused is worthless, and
    // leaving it behind restores a dead session on the next launch.
    expect(logout).toHaveBeenCalled();
  });

  it("does not drop the token on any other failure", async () => {
    // A 500 says the server had a problem, not that the session is bad.
    // Signing somebody out over a transient outage loses their place for no
    // reason, and on this app means re-entering a password to read a
    // medication list.
    respond(500, { detail: "Something went wrong." });

    const error = (await apiRequest("/goals", {
      fallbackMessage: "unused",
    }).catch((caught: ApiError) => caught)) as ApiError;

    expect(error.isAuthError).toBe(false);
    expect(logout).not.toHaveBeenCalled();
  });

  it("refuses before sending anything when there is no token", async () => {
    mockedGetToken.mockReturnValue(null);

    const error = (await apiRequest("/goals", {
      fallbackMessage: "unused",
    }).catch((caught: ApiError) => caught)) as ApiError;

    expect(error.isAuthError).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports an unreachable server as a network error, not an auth one", async () => {
    // These must stay distinguishable: one sends the user to sign in, the
    // other offers a retry. Confusing them is how an outage becomes a
    // spurious sign-out.
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );

    const error = (await apiRequest("/goals", {
      fallbackMessage: "Can't reach the MedHelp server.",
    }).catch((caught: ApiError) => caught)) as ApiError;

    expect(error.isNetworkError).toBe(true);
    expect(error.isAuthError).toBe(false);
    expect(logout).not.toHaveBeenCalled();
  });
});
