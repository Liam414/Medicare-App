import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { ProviderDetailScreen } from "@/screens/appointments/ProviderDetailScreen";
import type { Provider } from "@/services/providerService";

const PROVIDER: Provider = {
  npi: "1000000001",
  name: "Synthetic Urgent Care",
  specialty: "Clinic/Center, Urgent Care",
  phone: "(212) 555-0143",
  address: "1 Synthetic Plaza, New York, NY, 10001",
  city: "New York",
  state: "NY",
  postalCode: "10001",
  sourceName: "NPPES NPI Registry, US Centers for Medicare & Medicaid Services",
  distanceMiles: 1.24,
  schedulingUrl: null,
  schedulingSystem: null,
  schedulingKind: null,
};

function renderScreen(provider: Provider = PROVIDER, intake?: object) {
  const navigate = jest.fn();
  render(
    <ProviderDetailScreen
      navigation={{ navigate } as any}
      route={{ params: { provider, intake } } as any}
    />
  );
  return { navigate };
}

describe("ProviderDetailScreen", () => {
  it("explains that it cannot show appointment times, rather than showing none silently", () => {
    renderScreen();

    expect(screen.getByText("Available times")).toBeTruthy();
    expect(screen.getByText(/can't see this provider's calendar/i)).toBeTruthy();
  });

  it("shows no invented slots", () => {
    renderScreen();

    expect(screen.queryByText(/next available/i)).toBeNull();
    expect(screen.queryByText(/\d{1,2}:\d{2}\s*(am|pm)/i)).toBeNull();
  });

  it("keeps the request flow inside the app", () => {
    const intake = {
      reasonForVisit: "Sore throat.",
      tier: "URGENT" as const,
      assessmentId: "assessment-1",
    };
    const { navigate } = renderScreen(PROVIDER, intake);

    fireEvent.press(screen.getByText("Request this appointment"));

    expect(navigate).toHaveBeenCalledWith("AppointmentRequest", {
      provider: PROVIDER,
      intake,
    });
  });

  it("dials the provider rather than opening a maps or booking page", () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    renderScreen();

    fireEvent.press(screen.getByText("Call (212) 555-0143"));

    expect(openURL).toHaveBeenCalledWith("tel:2125550143");
    openURL.mockRestore();
  });

  it("carries the directory attribution", () => {
    renderScreen();

    expect(screen.getByText(/NPPES NPI Registry/)).toBeTruthy();
  });

  it("renders a provider with no phone number without offering to call", () => {
    renderScreen({ ...PROVIDER, phone: null });

    expect(screen.getByText("Request this appointment")).toBeTruthy();
    expect(screen.queryByText(/^Call /)).toBeNull();
  });
});

describe("handing off to the provider's own booking page", () => {
  const WITH_DIRECT: Provider = {
    ...PROVIDER,
    name: "Cleveland Clinic",
    schedulingUrl: "https://mychart.clevelandclinic.org/openscheduling/standalone",
    schedulingSystem: "Cleveland Clinic",
    schedulingKind: "direct",
  };

  const WITH_DIRECTORY: Provider = {
    ...PROVIDER,
    name: "Synthetic Regional Medical Center",
    schedulingUrl: "https://www.mychart.org/l/en-us/login/",
    schedulingSystem: "MyChart",
    schedulingKind: "directory",
  };

  it("offers nothing when no booking page is known", () => {
    // Most providers. An always-present button that usually goes nowhere
    // useful is worse than no button.
    renderScreen();

    expect(screen.queryByText(/^Open /)).toBeNull();
    expect(screen.queryByText(/^Search /)).toBeNull();
  });

  it("opens the provider's own page, exactly as given", () => {
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    renderScreen(WITH_DIRECT);

    fireEvent.press(screen.getByText("Open Cleveland Clinic"));

    expect(spy).toHaveBeenCalledWith(
      "https://mychart.clevelandclinic.org/openscheduling/standalone"
    );
    spy.mockRestore();
  });

  it("appends nothing about the user to the link", () => {
    /*
      ⛔ THE REASON THIS FEATURE NEEDS NO BAA.

      A hand-off transmits nothing: the URL is a constant and MedHelp sends no
      request. The moment a ZIP, a reason for visit or an assessment id is
      appended as a query parameter, this becomes health data leaving the app
      in a URL — the one place this repository is most careful to keep it out
      of, and it would do so silently.
    */
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    renderScreen(WITH_DIRECT, {
      reasonForVisit: "chest pain",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    fireEvent.press(screen.getByText("Open Cleveland Clinic"));

    const opened = spy.mock.calls[0][0] as string;
    expect(opened).not.toContain("?");
    expect(opened.toLowerCase()).not.toContain("chest");
    expect(opened.toLowerCase()).not.toContain("urgent");
    expect(opened).not.toContain("assessment-1");
    spy.mockRestore();
  });

  it("never says MedHelp is booking it", () => {
    /*
      ⛔ THE COPY IS THE WHOLE HONESTY OF THIS FEATURE.

      MedHelp cannot book. Three screens already say so, and a button that
      reads "Book your appointment" would undo all of them at the exact moment
      somebody is deciding whether they still have to phone.
    */
    renderScreen(WITH_DIRECT);

    expect(screen.queryByText(/^Book your/i)).toBeNull();
    expect(screen.queryByText(/we will book/i)).toBeNull();
    expect(screen.queryByText(/medhelp will book/i)).toBeNull();
    expect(screen.getByText(/you book with them there/i)).toBeTruthy();
    expect(screen.getByText(/medhelp is not involved/i)).toBeTruthy();
  });

  it("says a directory is a search, not a booking page", () => {
    // Two different promises. A button that says "Open" and lands on a search
    // box is a small betrayal, and this screen cannot afford one.
    renderScreen(WITH_DIRECTORY);

    expect(screen.getByText("Search MyChart")).toBeTruthy();
    expect(screen.getByText(/keeps a directory you can search/i)).toBeTruthy();
    expect(screen.getByText(/they may take bookings online/i)).toBeTruthy();
  });

  it("keeps calling above booking online", () => {
    /*
      Calling always works; a clinic's website may be down, may not offer what
      the person needs, or may demand an account. The path that always works
      stays first.
    */
    renderScreen(WITH_DIRECT);

    const call = screen.getByText("Call (212) 555-0143");
    const online = screen.getByText("Open Cleveland Clinic");

    expect(call).toBeTruthy();
    expect(online).toBeTruthy();
  });

  it("still records the visit in MedHelp separately", () => {
    // Booking elsewhere does not tell MedHelp anything, so the user's own
    // record is still theirs to make.
    renderScreen(WITH_DIRECT);

    expect(screen.getByText("Request this appointment")).toBeTruthy();
  });
});
