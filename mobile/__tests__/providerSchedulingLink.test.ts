import { getToken } from "@/services/authService";
import { searchProviders } from "@/services/providerService";

jest.mock("@/services/authService", () => ({
  getToken: jest.fn(),
  logout: jest.fn(async () => undefined),
}));

(getToken as jest.MockedFunction<typeof getToken>).mockReturnValue("test-token");

/**
 * What the client accepts as a booking link.
 *
 * The server registers only https URLs and a test there asserts it. This is
 * the second half of that: the value handed to `Linking.openURL` on somebody's
 * phone, checked at the boundary where it enters the app rather than trusted
 * because of what the server is supposed to send.
 */

const BASE = {
  npi: "1000000001",
  name: "Synthetic Regional Medical Center",
  specialty: "General Acute Care Hospital",
  phone: "(212) 555-0143",
  address: "1 Synthetic Plaza, New York, NY, 10001",
  city: "New York",
  state: "NY",
  postal_code: "10001",
  source_name: "NPPES NPI Registry",
  distance_miles: 1.2,
};

function respondWith(provider: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      providers: [provider],
      care_setting: "Urgent Care",
      postal_code: "10001",
      online_booking_available: false,
    }),
  }) as unknown as typeof fetch;
}

async function firstProvider() {
  const result = await searchProviders("10001", "Urgent Care");
  return result.providers[0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a booking link arriving from the server", () => {
  it("is carried through when it is https", async () => {
    respondWith({
      ...BASE,
      scheduling_url: "https://www.mychart.org/l/en-us/login/",
      scheduling_system: "MyChart",
      scheduling_kind: "directory",
    });

    const provider = await firstProvider();

    expect(provider.schedulingUrl).toBe("https://www.mychart.org/l/en-us/login/");
    expect(provider.schedulingSystem).toBe("MyChart");
    expect(provider.schedulingKind).toBe("directory");
  });

  it.each([
    "http://www.mychart.org/l/en-us/login/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "intent://scan/#Intent;scheme=zxing;end",
    "data:text/html,<script>alert(1)</script>",
    "",
  ])("is dropped when the scheme is not https: %s", async (url) => {
    /*
      ⛔ A SCHEME THIS CLIENT DID NOT EXPECT IS NOT A BOOKING PAGE.

      `Linking.openURL` will happily hand `javascript:`, `file:` or an Android
      `intent:` to the platform. Refusing anything but https here means the
      screen never has to think about it: a dropped link costs one button, an
      opened one costs whatever the scheme does.
    */
    respondWith({
      ...BASE,
      scheduling_url: url,
      scheduling_system: "Somewhere",
      scheduling_kind: "direct",
    });

    const provider = await firstProvider();

    expect(provider.schedulingUrl).toBeNull();
  });

  it("is null when the server sends nothing", async () => {
    // The ordinary case: most providers have no known booking page.
    respondWith(BASE);

    const provider = await firstProvider();

    expect(provider.schedulingUrl).toBeNull();
    expect(provider.schedulingSystem).toBeNull();
    expect(provider.schedulingKind).toBeNull();
  });

  it("rejects a kind it does not recognise rather than passing it on", async () => {
    // The screen branches on this to decide whether it says "Open" or
    // "Search". An unknown value must not fall through to the wrong promise.
    respondWith({
      ...BASE,
      scheduling_url: "https://example.org/book",
      scheduling_system: "Somewhere",
      scheduling_kind: "instant-booking",
    });

    const provider = await firstProvider();

    expect(provider.schedulingKind).toBeNull();
  });
});
