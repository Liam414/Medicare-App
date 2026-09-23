import { Pressable, StyleSheet, Text, View } from "react-native";

import { SELF_LABEL, type CareProfile } from "@/services/profileService";
import { BORDER_WIDTH, MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * Whose records are on screen.
 *
 * ⛔ Shown on every screen that reads or writes someone's medications,
 * symptoms or visits, whenever the account manages anyone else. Recording
 * Dad's new tablet under your own name — or describing Mum's chest pain into
 * your own history — is the failure this exists to prevent, and a caregiver
 * switching between people all day will make it without a constant reminder.
 *
 * Renders nothing for somebody who manages only themselves, so the app is
 * unchanged for them.
 */
export function ProfileBanner({
  active,
  profiles,
  onChange,
}: {
  active: CareProfile | null;
  profiles: CareProfile[];
  onChange: () => void;
}) {
  if (profiles.length === 0) return null;
  const name = active?.displayName ?? SELF_LABEL;

  return (
    <View style={styles.banner}>
      <Text style={styles.text} accessibilityRole="header">
        Showing records for: <Text style={styles.name}>{name}</Text>
      </Text>
      <Pressable
        onPress={onChange}
        accessibilityRole="button"
        accessibilityLabel={`Change whose records are shown. Currently ${name}.`}
        style={styles.change}
      >
        <Text style={styles.changeText}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    minHeight: MIN_TAP_TARGET,
  },
  text: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  change: { minHeight: MIN_TAP_TARGET, justifyContent: "center", paddingHorizontal: spacing.sm },
  changeText: { ...typography.bodyStrong, color: colors.accent },
});
