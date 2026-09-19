# Accessibility: state must reach the browser

Detail behind CLAUDE.md, section "accessibilityState does nothing on web".

### ⛔ `accessibilityState` does nothing on web. Say state in the label.

Not a quirk of one component — a property of the library. **React Native Web
0.19.13 never reads `accessibilityState` at all**: it is absent from
`forwardedProps` and from `createDOMProps`, which take `aria-checked`,
`aria-expanded` and `aria-selected` instead. The only places it is read are
the legacy `TouchableWithoutFeedback` and `isDisabled`, so on a `Pressable`
it is silently dropped and the DOM carries no state attribute at all.

It is still the right thing on native, so **keep it and add the state to
`accessibilityLabel`** — that is the one thing that works on every platform
regardless of what the library emits. `GoalCreateScreen`'s day chips,
`HealthGoalsScreen`'s ticks and its source disclosure all do this.

⛔ **A test that asserts `accessibilityState` is not evidence about a
browser.** It passes in jsdom whether or not anything reaches the DOM, which
is how both goals bugs survived a green suite. Assert the label.

#### The other six are fixed too, and a test now holds the rule

Found by grepping `accessibilityState` across `mobile/src` after the two goals
bugs. Checking each against React Native Web's source rather than assuming
split them in two:

| Call site | Verdict |
|---|---|
| `screens/intake/SymptomIntakeScreen.tsx` | **was broken** — a reader could not tell whether the consent box was ticked |
| `components/AppNav.tsx`, `components/SegmentedControl.tsx` | **was broken** — every tab announced identically |
| `ProviderSearchScreen`, `BookingIdentityScreen`, `MedicationRemindersScreen` | **was broken** — three radio groups announcing no selection |
| `components/AppButton.tsx` | fine: it passes `disabled`, and RNW's `Pressable` sets `aria-disabled` from **that prop** |
| `components/TextField.tsx` | fine: it passes `editable`, and RNW's `TextInput` derives the DOM state from **that prop** |

The consent checkbox was the worst of them: a control whose entire job is to
make agreement unambiguous, on the most sensitive text in the app. ⛔ That edit
changes no disclaimer and no escalation copy, but it is still text on the
intake screen, so it belongs in the clinical reviewer's read of that screen —
the same standing as the URGENT hand-off.

`mobile/__tests__/accessibleState.test.ts` holds the rule for everything
added later. ⛔ **It reads the source rather than rendering**, because in jsdom
`accessibilityState` is on the element whether or not anything reaches the DOM
— that is exactly why the ticks' own test passed while a reader was told
nothing. It anchors each region on `accessibilityRole` (unique per call site)
and asserts the label varies. Two cruder detectors were tried and both
reported already-fixed sites: slicing to the next `>` truncates on `=>` and on
these files' own ⛔ comments, and a plain character window reaches back into
the previous element and finds *its* label.

⛔ **`EXEMPT` is not a snooze button.** It is for call sites where the state
genuinely reaches the DOM another way, each entry has to say which route, and
a test asserts the reasons are real. Adding a file to it to make the suite
green is how a list like this becomes the place bugs go to be forgotten.

