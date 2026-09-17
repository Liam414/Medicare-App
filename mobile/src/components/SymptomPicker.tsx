import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AREA_LABELS,
  matchSymptoms,
  relatedByArea,
  symptomById,
  type Symptom,
} from "@/services/symptomVocabulary";
import { MIN_TAP_TARGET, colors, fonts, radius, spacing, typography } from "@/theme";

/**
 * Suggests lay symptom phrases as somebody types, and collects the ones they
 * pick into a list.
 *
 * ⛔ WHAT THIS COMPONENT IS NOT ALLOWED TO DO.
 *
 * - It never shows a severity, a tier, a colour meaning urgency, or an
 *   ordering by seriousness. Urgency is decided once, downstream, by the
 *   classifier reading the whole description. A symptom that looked "mild"
 *   here would be reassurance MedHelp authored, and the triage design is
 *   explicit that nothing may lower a tier.
 * - It never names a condition. The vocabulary contains none; do not add one.
 * - It never replaces what the user typed. The description stays exactly as
 *   written, and picked phrases travel BESIDE it as a separate list, so the
 *   person can always see which words are theirs and which are the app's.
 * - It never presents the related list as clinically connected. Those are
 *   other phrases about the same part of the body — see `relatedByArea` — and
 *   the heading has to keep saying so.
 *
 * Nothing here decides anything. It assembles text for a classifier that has
 * its own reviewed rules, and every phrase it offers is visible and removable
 * before the user submits.
 */

interface SymptomPickerProps {
  /** What the user has typed. Read only — this component never edits it. */
  description: string;
  /** Ids already chosen, in tap order. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SymptomPicker({
  description,
  selectedIds,
  onChange,
  disabled = false,
}: SymptomPickerProps) {
  const suggestions = useMemo(
    () => matchSymptoms(description, selectedIds),
    [description, selectedIds]
  );

  /*
    Anything already offered above is excluded here.

    A phrase can legitimately reach both lists — typing "my throat is really
    sore" matches "an earache" on the word "sore", and choosing "a sore throat"
    also makes every ear-nose-throat phrase a neighbour — and the same chip
    twice reads as two different things to add.
  */
  const related = useMemo(
    () => relatedByArea(selectedIds, [...selectedIds, ...suggestions.map((s) => s.id)]),
    [selectedIds, suggestions]
  );

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => symptomById(id))
        .filter((symptom): symptom is Symptom => symptom !== undefined),
    [selectedIds]
  );

  const add = (id: string) => onChange([...selectedIds, id]);
  const remove = (id: string) => onChange(selectedIds.filter((each) => each !== id));

  /*
    The areas named in the related heading. Plural areas are joined plainly
    rather than being reduced to one, because picking the "main" area would be
    a judgement about which complaint matters most — which is the ranking this
    component is not allowed to do.
  */
  const relatedAreas = useMemo(() => {
    const areas = new Set(related.map((symptom) => AREA_LABELS[symptom.area]));
    return [...areas];
  }, [related]);

  const nothingToShow =
    suggestions.length === 0 && related.length === 0 && selected.length === 0;
  if (nothingToShow) return null;

  return (
    <View style={styles.wrap}>
      {selected.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.heading}>Symptoms you have added</Text>
          <Text style={styles.note}>
            These are sent along with what you wrote. Remove any that are not
            right.
          </Text>
          <View style={styles.chipRow}>
            {selected.map((symptom) => (
              <SymptomChip
                key={symptom.id}
                symptom={symptom}
                added
                onPress={() => remove(symptom.id)}
                disabled={disabled}
                testGroup="selected"
              />
            ))}
          </View>
        </View>
      )}

      {suggestions.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.heading}>Did you mean any of these?</Text>
          <Text style={styles.note}>
            Matched to the words you typed. Adding one does not change what you
            wrote.
          </Text>
          <SuggestionList
            symptoms={suggestions}
            onPick={add}
            disabled={disabled}
            testGroup="matched"
          />
        </View>
      )}

      {related.length > 0 && (
        <View style={styles.block}>
          {/*
            ⛔ This heading carries the whole honesty of the feature. These are
            other things people say about the same part of the body — NOT
            symptoms MedHelp thinks go with the ones already picked. Do not
            reword it to imply a connection the app cannot know.
          */}
          <Text style={styles.heading}>
            Other things people describe about the {relatedAreas.join(" and ")}
          </Text>
          <Text style={styles.note}>
            Listed because they are about the same part of the body, not
            because MedHelp thinks they are connected to yours.
          </Text>
          <SuggestionList
            symptoms={related}
            onPick={add}
            disabled={disabled}
            testGroup="related"
          />
        </View>
      )}
    </View>
  );
}


/**
 * One symptom, in one of two states.
 *
 * ⛔ THERE IS ONE CHIP COMPONENT, NOT TWO, AND THAT IS WHY THE LABEL IS SAFE.
 *
 * The first draft of this file had a separate element for an added chip and an
 * offered chip, each with its state hard-coded into its own label. That is
 * correct output and an unsafe shape: `accessibleState.test.ts` reads each call
 * site and asks whether the label CAN differ between states, and two fixed
 * labels in two places cannot — so the next person to merge them, or to add a
 * third state, has nothing telling them the state has to be spoken.
 *
 * With one component the rule is enforceable: this label always says which
 * state it is in, and the guard can see that it varies.
 *
 * `accessibilityState` is kept beside it because it is right on native. React
 * Native Web 0.19.13 never reads it — it takes `aria-selected` instead — so on
 * the web the label is the only thing a reader gets, which is exactly why the
 * label carries the words.
 */
function SymptomChip({
  symptom,
  added,
  onPress,
  disabled,
  testGroup,
}: {
  symptom: Symptom;
  added: boolean;
  onPress: () => void;
  disabled: boolean;
  testGroup: string;
}) {
  return (
    <Pressable
      testID={`symptom-${testGroup}-${symptom.id}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: added }}
      accessibilityLabel={
        added
          ? `${symptom.label}, added. Activate to remove.`
          : `${symptom.label}, not added. Activate to add.`
      }
      style={[styles.chip, added && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text
        style={added ? styles.chipRemove : styles.chipAdd}
        accessibilityElementsHidden
      >
        {added ? "✕" : "+"}
      </Text>
      <Text style={added ? styles.chipSelectedText : styles.chipText}>
        {symptom.label}
      </Text>
    </Pressable>
  );
}
function SuggestionList({
  symptoms,
  onPick,
  disabled,
  testGroup,
}: {
  symptoms: Symptom[];
  onPick: (id: string) => void;
  disabled: boolean;
  testGroup: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      accessibilityRole="list"
    >
      {symptoms.map((symptom) => (
        <SymptomChip
          key={symptom.id}
          symptom={symptom}
          added={false}
          onPress={() => onPick(symptom.id)}
          disabled={disabled}
          testGroup={testGroup}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  block: { gap: spacing.xs },
  heading: { ...typography.bodyStrong, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textSecondary },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  /*
    Selected chips use the accent, not a safety family. ⛔ Never colour these
    with the emergency, error or notice palettes — those carry a reviewed
    meaning about urgency, and a symptom chip asserts nothing about urgency.
  */
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { opacity: 0.5 },
  chipText: { ...typography.caption, color: colors.textPrimary },
  chipSelectedText: { ...typography.caption, color: colors.textOnAccent },
  chipAdd: { ...typography.caption, color: colors.textSecondary, fontFamily: fonts.sansBold },
  chipRemove: { ...typography.caption, color: colors.textOnAccent, fontFamily: fonts.sansBold },
});
