import { Pressable, StyleSheet, Text, View } from "react-native";

import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * Tappable shortcuts that fill a free-text field.
 *
 * ⛔ WHAT THIS IS, AND THE LINE IT MUST NOT CROSS.
 *
 * It is a typing shortcut. Tapping a chip writes its exact words into a text
 * field that stays editable, and the field's value is the only thing that
 * travels. There is no hidden value, no code, no id — what the chip says is
 * what the field contains and what the user can then change.
 *
 * That matters most on the appointment form, because CLAUDE.md fences
 * something that looks similar from a distance:
 *
 *     "Do not add a slot picker, a 'Book now' button, or a time, until a real
 *      scheduling integration exists behind it."
 *
 * A chip reading "Tomorrow morning" is **not** a slot picker and must never
 * become one. The difference is not cosmetic:
 *
 *   - A slot picker offers times the app claims are AVAILABLE. MedHelp has no
 *     source for availability — NPPES publishes none — so any time it offered
 *     would be invented, and somebody would turn up for an appointment that
 *     does not exist.
 *   - These chips offer words for a PREFERENCE the user is going to say to a
 *     receptionist themselves. They assert nothing about the clinic, and
 *     `preferred_time` remains the free text it has always been.
 *
 * So: never drive these from provider data, never render one as unavailable,
 * never sort them by anything a clinic told us, and never turn the chosen text
 * into a datetime. If any of those is wanted, it needs the scheduling
 * integration the fence is about.
 */

interface QuickFillChipsProps {
  /** Names the group for a screen reader, e.g. "Common reasons". */
  label: string;
  options: readonly string[];
  /** The field's current text. A chip is "chosen" when it matches exactly. */
  value: string;
  onSelect: (text: string) => void;
  disabled?: boolean;
  /** Prefix for testIDs, so two groups on one screen stay distinguishable. */
  testGroup: string;
}

export function QuickFillChips({
  label,
  options,
  value,
  onSelect,
  disabled = false,
  testGroup,
}: QuickFillChipsProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="list">
        {options.map((option) => {
          const chosen = value.trim() === option;
          return (
            <Pressable
              key={option}
              testID={`quickfill-${testGroup}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              onPress={() => onSelect(chosen ? "" : option)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              /*
                ⛔ THE STATE IS IN THE LABEL. React Native Web 0.19.13 drops
                `accessibilityState` entirely, so on the web a reader gets this
                and nothing else. This repository has shipped that bug three
                times — the goals ticks, the source disclosure, and the intake
                consent checkbox — and each time the suite was green because
                jsdom keeps the prop whether or not it reaches the DOM.
              */
              accessibilityLabel={
                chosen
                  ? `${option}, chosen. Activate to clear it.`
                  : `${option}. Activate to use it.`
              }
              style={[
                styles.chip,
                chosen && styles.chipChosen,
                disabled && styles.chipDisabled,
              ]}
            >
              <Text style={chosen ? styles.chipChosenText : styles.chipText}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  /*
    ⛔ The accent, never a safety family. A preferred time and a reason for
    visit assert nothing about urgency, and the emergency/error/notice palettes
    carry a reviewed meaning that would be borrowed falsely here.
  */
  chipChosen: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { opacity: 0.5 },
  chipText: { ...typography.caption, color: colors.textPrimary },
  chipChosenText: { ...typography.caption, color: colors.textOnAccent },
});
