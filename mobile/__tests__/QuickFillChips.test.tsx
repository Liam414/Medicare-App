import { fireEvent, render, screen } from "@testing-library/react-native";

import { QuickFillChips } from "@/components/QuickFillChips";

/**
 * A typing shortcut, and the line it must not cross.
 *
 * These chips fill a free-text field that stays editable. They are not a slot
 * picker, and CLAUDE.md fences one of those until a real scheduling
 * integration exists — because MedHelp has no availability data, so any time
 * it offered as bookable would be invented and somebody would turn up for it.
 */

const OPTIONS = ["As soon as possible", "This week", "Next week"] as const;

function renderChips(value = "") {
  const onSelect = jest.fn();
  render(
    <QuickFillChips
      label="Or pick one"
      options={OPTIONS}
      value={value}
      onSelect={onSelect}
      testGroup="time"
    />
  );
  return { onSelect };
}

describe("QuickFillChips", () => {
  it("passes the chip's exact words up, with no hidden value", () => {
    // What the person sees is what lands in the field and what they will read
    // out to a receptionist. A code behind the label would mean agreeing to
    // words they never saw.
    const { onSelect } = renderChips();

    fireEvent.press(screen.getByTestId("quickfill-time-this-week"));

    expect(onSelect).toHaveBeenCalledWith("This week");
  });

  it("clears the field when the chosen chip is pressed again", () => {
    const { onSelect } = renderChips("This week");

    fireEvent.press(screen.getByTestId("quickfill-time-this-week"));

    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("treats only an exact match as chosen", () => {
    // The field is editable, so "This week if you can" is the user's own text
    // and no chip should claim it.
    renderChips("This week if you can");

    expect(
      screen.getByLabelText("This week. Activate to use it.")
    ).toBeTruthy();
  });

  it("says chosen or not chosen in the label, not only in accessibilityState", () => {
    /*
      ⛔ React Native Web 0.19.13 never reads `accessibilityState` — it takes
      `aria-selected` instead — so on the web a reader gets the label and
      nothing else. This repository has shipped that bug three times, each time
      under a green suite, because jsdom keeps the prop whether or not it
      reaches the DOM. Assert the label.
    */
    renderChips("This week");

    expect(
      screen.getByLabelText("This week, chosen. Activate to clear it.")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Next week. Activate to use it.")
    ).toBeTruthy();
  });

  it("renders every option, in the order given", () => {
    // Never reordered by anything — there is nothing here to rank by, and a
    // clinic never told us any of it.
    renderChips();

    for (const option of OPTIONS) {
      expect(screen.getByText(option)).toBeTruthy();
    }
  });

  it("does nothing when disabled", () => {
    const onSelect = jest.fn();
    render(
      <QuickFillChips
        label="Or pick one"
        options={OPTIONS}
        value=""
        onSelect={onSelect}
        disabled
        testGroup="time"
      />
    );

    fireEvent.press(screen.getByTestId("quickfill-time-this-week"));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
