import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("says whether a body area is open in the label, not only in accessibilityState", () => {
    // Same rule, same reason, on the control added for browsing.
    renderPicker("");

    expect(
      screen.getByLabelText(/chest, \d+ phrases\. activate to show them\./i)
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("symptom-area-chest"));

    expect(
      screen.getByLabelText(/chest, showing \d+ phrases\. activate to hide them\./i)
    ).toBeTruthy();
  });
});

describe("browsing with nothing typed", () => {
  /*
    ⛔ THE COMPONENT USED TO RENDER NOTHING HERE, AND THAT WAS THE PROBLEM.

    `matchSymptoms` needs three characters before it offers anything, so on an
    empty screen there was nothing to show and the picker returned null. The
    only way to reach the vocabulary was to start writing — which is precisely
    what the person this was built for does not want to do.
  */

  it("shows the list even when nothing has been typed or picked", () => {
    renderPicker("");

    expect(screen.getByText("Or pick from a list")).toBeTruthy();
    expect(screen.getByTestId("symptom-area-chest")).toBeTruthy();
    expect(screen.getByTestId("symptom-area-skin")).toBeTruthy();
  });

  it("opens one area at a time and offers its phrases", () => {
    renderPicker("");

    // Closed to begin with: the phrases are behind the area button.
    expect(screen.queryByTestId("symptom-browse-chest-pain")).toBeNull();

    fireEvent.press(screen.getByTestId("symptom-area-chest"));

    expect(screen.getByTestId("symptom-browse-chest-pain")).toBeTruthy();
  });

  it("adds a phrase picked by browsing, with nothing typed", () => {
    const { onChange } = renderPicker("");

    fireEvent.press(screen.getByTestId("symptom-area-chest"));
    fireEvent.press(screen.getByTestId("symptom-browse-chest-pain"));

    expect(onChange).toHaveBeenCalledWith(["chest-pain"]);
  });

  it("closes an open area when its button is pressed again", () => {
    renderPicker("");

    fireEvent.press(screen.getByTestId("symptom-area-chest"));
    expect(screen.getByTestId("symptom-browse-chest-pain")).toBeTruthy();

    fireEvent.press(screen.getByTestId("symptom-area-chest"));
    expect(screen.queryByTestId("symptom-browse-chest-pain")).toBeNull();
  });

  it("replaces the list of areas with the one that was opened", () => {
    /*
      ⛔ THE REPORTED BUG. Every area used to stay on screen underneath the
      open one, so a person who tapped "chest" read its phrases in the middle
      of nineteen other buttons — and since an area was drawn as the same pill
      as a symptom, "head" and "eyes" read as things you could add. One thing
      at a time is the fix, and this is what pins it.
    */
    renderPicker("");

    fireEvent.press(screen.getByTestId("symptom-area-chest"));

    expect(screen.getByTestId("symptom-browse-chest-pain")).toBeTruthy();
    expect(screen.queryByTestId("symptom-area-skin")).toBeNull();
    expect(screen.queryByTestId("symptom-area-head")).toBeNull();
  });

  it("switches areas rather than stacking them open", () => {
    // Two hundred phrases at once is not a list anybody reads.
    renderPicker("");

    fireEvent.press(screen.getByTestId("symptom-area-chest"));
    // Back to the menu, which is the only way to another area now.
    fireEvent.press(screen.getByTestId("symptom-area-chest"));
    fireEvent.press(screen.getByTestId("symptom-area-skin"));

    expect(screen.queryByTestId("symptom-browse-chest-pain")).toBeNull();
    expect(screen.getByTestId("symptom-browse-rash")).toBeTruthy();
  });

  it("does not offer a phrase that has already been added", () => {
    renderPicker("", ["chest-pain"]);

    fireEvent.press(screen.getByTestId("symptom-area-chest"));

    expect(screen.queryByTestId("symptom-browse-chest-pain")).toBeNull();
    expect(screen.getByTestId("symptom-browse-heart-racing")).toBeTruthy();
  });

  it("describes the list as a way in, never as a set of suggestions about you", () => {
    /*
      The browse list is the whole vocabulary filed by body part. It is not
      matched to anything the person said, and must not read as though MedHelp
      picked it for them — the same rule the related-phrases heading carries.
    */
    renderPicker("");

    expect(screen.queryByText(/we think/i)).toBeNull();
    expect(screen.queryByText(/based on/i)).toBeNull();
    expect(screen.queryByText(/likely/i)).toBeNull();
    expect(screen.getByText(/without typing anything/i)).toBeTruthy();
  });
});

describe("it is painted in the destination's colour", () => {
  /*
    Reported 2026-09-19: the picker "doesn't really mesh well with the other
    themes of the page". It was literally true — every other control on the
    Symptoms screen reads `useDomain()` and comes out Symptoms blue, and this
    component alone hard-coded `colors.accent`, which is the teal of `today`.
    So the one block a person interacts with was the one fighting the band
    above it.

    ⛔ Asserted against the SOURCE, not a render. A colour reaching the DOM in
    jsdom proves nothing about which token it came from, and the question here
    is which token — the same reason `accessibleState.test.ts` reads source.
  */
  const raw = readFileSync(
    join(__dirname, "..", "src", "components", "SymptomPicker.tsx"),
    "utf8"
  );

  /*
    Comments stripped first. The file EXPLAINS that it used to hard-code
    `colors.accent`, and the first version of this test matched that sentence
    and failed on a correct file — a check that cannot tell code from the prose
    describing it is a check that punishes documenting the fix.
  */
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("reads the domain rather than hard-coding the global accent", () => {
    expect(source).toContain("useDomain()");
    expect(source).not.toMatch(/colors\.accent/);
  });

  it("never paints a chip or an area from a reviewed safety family", () => {
    // ⛔ emergency/error/notice/success carry a reviewed meaning about urgency.
    // A symptom phrase and a body area assert nothing about urgency.
    for (const family of ["emergency", "error", "notice", "success"]) {
      expect(source).not.toMatch(new RegExp(`colors\.${family}`));
    }
  });
});
