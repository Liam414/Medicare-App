/** The emergency bar dials exactly 911 and 988 — the highest-consequence literals on screen. */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { EmergencyCallBar } from "@/components/EmergencyCallBar";

describe("EmergencyCallBar", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("dials 911 in one tap", () => {
    render(<EmergencyCallBar />);
    fireEvent.press(screen.getByText("Call 911"));
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringMatching(/^tel(prompt)?:911$/));
  });

  it("dials 988 in one tap, and says it is for a mental health crisis", () => {
    render(<EmergencyCallBar compact />);
    expect(screen.getByText(/mental health or suicide crisis, call or text 988/)).toBeTruthy();
    fireEvent.press(screen.getByText("Call 988"));
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringMatching(/^tel(prompt)?:988$/));
  });
});
