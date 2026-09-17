import { fireEvent, render, screen } from "@testing-library/react-native";

import { SymptomPicker } from "@/components/SymptomPicker";

/**
 * The picker is the user-facing half of app-authored clinical vocabulary.
 * These tests hold the promises the screen makes about it.
 */

function renderPicker(
  description: string,
  selectedIds: string[] = []
) {
  const onChange = jest.fn();
  render(
    <SymptomPicker
      description={description}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  );
  return { onChange };
}

describe("offering phrases", () => {
  it("shows nothing at all until there is something to offer", () => {
    const { onChange } = renderPicker("");

    expect(screen.queryByText(/did you mean/i)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("suggests a phrase matching what was typed", () => {
    renderPicker("my throat is really sore");

    expect(screen.getByText("Did you mean any of these?")).toBeTruthy();
    expect(screen.getByTestId("symptom-matched-sore-throat")).toBeTruthy();
  });

  it("adds a phrase when one is pressed, without touching the description", () => {
    const { onChange } = renderPicker("my throat is really sore");

    fireEvent.press(screen.getByTestId("symptom-matched-sore-throat"));

    expect(onChange).toHaveBeenCalledWith(["sore-throat"]);
  });

  it("removes a phrase that was added", () => {
    const { onChange } = renderPicker("my throat is really sore", ["sore-throat"]);

    fireEvent.press(screen.getByLabelText(/a sore throat, added/i));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("what the picker is not allowed to say", () => {
  it("never shows a severity, tier or urgency word", () => {
    // ⛔ The load-bearing test. A symptom shown as "mild" is reassurance
    // MedHelp authored, and nothing in this app may lower a tier. Urgency is
    // decided once, downstream, from the whole description.
    renderPicker("chest pain and I feel sick", ["chest-pain"]);

    const forbidden = [
      /emergent/i,
      /\burgent\b/i,
      /self.care/i,
      /\bmild\b/i,
      /\bmoderate\b/i,
      /\bsevere\b/i,
      /\bserious\b/i,
      /priority/i,
      /\brisk\b/i,
      /call 911/i,
    ];

    for (const pattern of forbidden) {
      expect(screen.queryByText(pattern)).toBeNull();
    }
  });

  it("says the related list is about a body area, not a connection", () => {
    // ⛔ This heading carries the honesty of the feature. MedHelp does not know
    // which symptoms go together and may not imply that it does.
    renderPicker("", ["sore-throat"]);

    expect(
      screen.getByText(/other things people describe about the ears, nose and throat/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/not because MedHelp thinks they are connected to yours/i)
    ).toBeTruthy();
  });

  it("does not claim the related phrases are symptoms of anything", () => {
    renderPicker("", ["sore-throat"]);

    expect(screen.queryByText(/related to your/i)).toBeNull();
    expect(screen.queryByText(/you may also have/i)).toBeNull();
    expect(screen.queryByText(/commonly occurs with/i)).toBeNull();
  });
});

describe("accessibility", () => {
  it("says added or not added in the label, not only in accessibilityState", () => {
    /*
      ⛔ React Native Web 0.19.13 never reads `accessibilityState`, so a chip
      that carried its state only there would tell a browser reader nothing —
      exactly the bug that survived a green suite twice in this repository.
      Assert the label, which is the thing that works on every platform.
    */
    renderPicker("my throat is really sore", ["sore-throat"]);

    expect(screen.getByLabelText(/a sore throat, added\. activate to remove\./i)).toBeTruthy();
    expect(screen.getByLabelText(/an earache, not added\. activate to add\./i)).toBeTruthy();
  });
});
