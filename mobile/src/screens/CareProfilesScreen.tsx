import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { TextField } from "@/components/TextField";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { ApiError } from "@/services/apiClient";
import { clearCard } from "@/services/emergencyCard";
import {
  SELF_LABEL,
  createProfile,
  deleteProfile,
  setActiveProfile,
  type CareProfile,
} from "@/services/profileService";
import { rearm } from "@/services/reminderArming";
import { BORDER_WIDTH, MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "CareProfiles">;

/**
 * The people this account keeps records for, and which one is on screen.
 *
 * ⛔ A name is all MedHelp asks for. It is shown back and never interpreted —
 * no age, no relationship, nothing that could become a triage input.
 */
export function CareProfilesScreen({ navigation }: Props) {
  const { active, profiles, refresh } = useActiveProfile();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (profile: CareProfile | null) => {
    await setActiveProfile(profile);
    navigation.goBack();
  };

  const add = async () => {
    if (!name.trim()) {
      setError("Give this person a name you'll recognise.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createProfile(name.trim());
      setName("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't add that person.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profile: CareProfile) => {
    setBusy(true);
    setError(null);
    try {
      await deleteProfile(profile.id);
      // Their card lives on this device, keyed by profile. A clear that left
      // it behind would not be a clear.
      await clearCard(profile.id);
      if (active?.id === profile.id) await setActiveProfile(null);
      setConfirming(null);
      await refresh();
      // Their reminders went with their medications; disarm them now.
      void rearm();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't remove that person.");
    } finally {
      setBusy(false);
    }
  };

  const rows: (CareProfile | null)[] = [null, ...profiles];

  return (
    <Screen
      band={
        <ScreenBand
          title="People you look after"
          meta="Keep medications, symptoms and visits for someone else separately from your own."
        />
      }
    >
      {error && <ErrorNotice message={error} />}

      {rows.map((profile) => {
        const label = profile?.displayName ?? SELF_LABEL;
        const selected = (active?.id ?? null) === (profile?.id ?? null);
        return (
          <View key={profile?.id ?? "self"} style={styles.row}>
            <Pressable
              onPress={() => void choose(profile)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              // ⛔ State in the label: React Native Web drops accessibilityState.
              accessibilityLabel={`${label}, ${selected ? "selected" : "not selected"}`}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={styles.optionText}>{label}</Text>
              {selected && <Text style={styles.optionMark}>Showing</Text>}
            </Pressable>
            {profile &&
              (confirming === profile.id ? (
                <View style={styles.confirm}>
                  <Text style={styles.confirmText}>
                    This deletes {label}'s medications, reminder times, saved
                    descriptions and visits from MedHelp, and their emergency
                    card from this device.
                  </Text>
                  <AppButton
                    label={`Remove ${label} and their records`}
                    variant="outline"
                    loading={busy}
                    onPress={() => void remove(profile)}
                  />
                  <AppButton label="Keep" variant="secondary" onPress={() => setConfirming(null)} />
                </View>
              ) : (
                <AppButton
                  label={`Remove ${label}`}
                  variant="secondary"
                  onPress={() => setConfirming(profile.id)}
                />
              ))}
          </View>
        );
      })}

      <TextField
        label="Add someone"
        placeholder="A name you'll recognise, e.g. Mum"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <AppButton label="Add" onPress={() => void add()} loading={busy} />
      <Text style={styles.note}>
        MedHelp only stores the name you give. Records you keep for someone
        else are health information about them — keep them only with their
        agreement, or as their parent or carer.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: MIN_TAP_TARGET,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  optionText: { ...typography.bodyStrong, color: colors.textPrimary },
  optionMark: { ...typography.caption, color: colors.accent },
  confirm: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  confirmText: { ...typography.body, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textSecondary },
});
