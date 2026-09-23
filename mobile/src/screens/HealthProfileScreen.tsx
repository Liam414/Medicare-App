import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ProfileBanner } from "@/components/ProfileBanner";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { SuccessNotice } from "@/components/SuccessNotice";
import { TextField } from "@/components/TextField";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { ApiError } from "@/services/apiClient";
import { logout } from "@/services/authService";
import { clearCard } from "@/services/emergencyCard";
import {
  deleteAccount,
  exportAccount,
  getHealthProfile,
  saveExport,
  saveHealthProfile,
  type HealthProfile,
} from "@/services/healthProfileService";
import { BORDER_WIDTH, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "HealthProfile">;

type Field = keyof HealthProfile;

const FIELDS: { key: Field; label: string; one: string; placeholder: string }[] = [
  { key: "allergies", label: "Allergies", one: "allergy", placeholder: "As you'd write it on a form" },
  { key: "conditions", label: "Conditions", one: "condition", placeholder: "In your own words" },
];

/**
 * Conditions and allergies, for whoever is on screen, plus the account's data
 * rights: export everything, delete everything.
 *
 * ⛔ Free text only. No picker of conditions and no list of common allergies —
 * offering a menu would make MedHelp the author of a clinical vocabulary.
 * Nothing typed here is checked, corrected or interpreted.
 *
 * ⛔ An empty section says "Not recorded", never "None".
 */
export function HealthProfileScreen({ navigation }: Props) {
  const { active, profiles, ready, profileId } = useActiveProfile();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [drafts, setDrafts] = useState<Record<Field, string>>({ allergies: "", conditions: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!ready) return;
    setProfile(null);
    getHealthProfile(profileId)
      .then(setProfile)
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "We couldn't load the health profile.")
      );
  }, [ready, profileId]);

  const add = (key: Field) => {
    const entry = drafts[key].trim();
    if (!entry || !profile) return;
    setProfile({ ...profile, [key]: [...profile[key], entry] });
    setDrafts({ ...drafts, [key]: "" });
    setSaved(false);
  };

  const remove = (key: Field, index: number) => {
    if (!profile) return;
    setProfile({ ...profile, [key]: profile[key].filter((_, i) => i !== index) });
    setSaved(false);
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      // Anything still typed in a box counts — losing it on save would be a
      // quiet way to drop an allergy.
      const withDrafts: HealthProfile = {
        allergies: [...profile.allergies, drafts.allergies.trim()].filter(Boolean),
        conditions: [...profile.conditions, drafts.conditions.trim()].filter(Boolean),
      };
      setProfile(await saveHealthProfile(profileId, withDrafts));
      setDrafts({ allergies: "", conditions: "" });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't save the health profile.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setError(null);
    try {
      await saveExport(await exportAccount(), (content) => Share.share(content));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't prepare your data.");
    }
  };

  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      // The server copy is gone; the device copies go with it.
      await Promise.all([clearCard(null), ...profiles.map((p) => clearCard(p.id))]);
      await logout();
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't delete your account.");
      setBusy(false);
    }
  };

  return (
    <Screen
      band={
        <ScreenBand
          title="Health profile"
          meta="Allergies and conditions, in your own words. MedHelp adds them to your visit summary."
        />
      }
    >
      <ProfileBanner active={active} profiles={profiles} onChange={() => navigation.navigate("CareProfiles")} />
      {error && <ErrorNotice message={error} />}
      {saved && <SuccessNotice message="Saved." />}

      {profile &&
        FIELDS.map(({ key, label, one, placeholder }) => (
          <View key={key} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              {label}
            </Text>
            {profile[key].length === 0 ? (
              <Text style={styles.empty}>Not recorded</Text>
            ) : (
              profile[key].map((entry, index) => (
                <View key={`${entry}-${index}`} style={styles.entry}>
                  <Text style={styles.entryText}>{entry}</Text>
                  <AppButton
                    label="Remove"
                    variant="secondary"
                    accessibilityHint={`Removes ${entry} from ${label.toLowerCase()}`}
                    onPress={() => remove(key, index)}
                  />
                </View>
              ))
            )}
            <TextField
              label={`New ${one}`}
              placeholder={placeholder}
              value={drafts[key]}
              onChangeText={(value) => setDrafts({ ...drafts, [key]: value })}
              autoCapitalize="sentences"
            />
            <AppButton label={`Add ${one}`} variant="outline" onPress={() => add(key)} />
          </View>
        ))}

      {profile && <AppButton label="Save health profile" loading={busy && !deleting} onPress={() => void save()} />}

      <Text style={styles.note}>
        MedHelp stores exactly what you type and does not check it. It is
        encrypted on MedHelp's server. It supports your care and does not
        replace a clinician's own records.
      </Text>

      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">
          Your data
        </Text>
        <Text style={styles.note}>
          Download everything MedHelp's server holds for your account, including
          the people you look after.
        </Text>
        <AppButton label="Download my data" variant="secondary" onPress={() => void download()} />
        {deleting ? (
          <View style={styles.confirm}>
            <Text style={styles.entryText}>
              This permanently deletes your account and every record in it —
              medications, reminders, saved descriptions, visits, goals and
              health profiles, for you and everyone you look after — and the
              emergency cards on this device. It cannot be undone.
            </Text>
            <TextField
              label="Your password, to confirm"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <AppButton
              label="Delete my account and all records"
              variant="outline"
              loading={busy}
              disabled={!password}
              onPress={() => void erase()}
            />
            <AppButton label="Keep my account" variant="secondary" onPress={() => setDeleting(false)} />
          </View>
        ) : (
          <AppButton label="Delete my account" variant="secondary" onPress={() => setDeleting(true)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { ...typography.overline, color: colors.textSecondary },
  empty: { ...typography.body, color: colors.textSecondary },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
  },
  entryText: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  confirm: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  note: { ...typography.caption, color: colors.textSecondary },
});
