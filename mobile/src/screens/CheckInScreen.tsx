import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ProfileBanner } from "@/components/ProfileBanner";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { TextField } from "@/components/TextField";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { ApiError } from "@/services/apiClient";
import {
  FEELING_LABELS,
  listDailyCheckIns,
  recordDailyCheckIn,
  type DailyCheckIn,
  type Feeling,
} from "@/services/dailyCheckIns";
import { localDay } from "@/services/medicationService";
import { BORDER_WIDTH, MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "CheckIn">;

const FEELINGS: Feeling[] = ["better", "same", "worse"];
const TREND_DAYS = 14;
// Column height only. Drawing "worse" lower is the whole of the chart; it
// says nothing the person did not say themselves.
const HEIGHT: Record<Feeling, number> = { better: 72, same: 48, worse: 24 };

function lastDays(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return localDay(d);
  });
}

/**
 * "How are you feeling today?" and the person's own answers over time.
 *
 * ⛔ No interpretation. The chart draws what was answered and nothing else —
 * no "you're improving", no count, no streak, no score.
 */
export function CheckInScreen({ navigation }: Props) {
  const { active, profiles, ready, profileId } = useActiveProfile();
  const [history, setHistory] = useState<DailyCheckIn[]>([]);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<DailyCheckIn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHistory(await listDailyCheckIns(profileId, TREND_DAYS));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't load your check-ins.");
    }
  }, [profileId]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const save = async () => {
    if (!feeling) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await recordDailyCheckIn(profileId, localDay(), feeling, note));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't save your check-in.");
    } finally {
      setBusy(false);
    }
  };

  const byDay = new Map(history.map((c) => [c.day, c]));

  return (
    <Screen band={<ScreenBand title="How are you feeling today?" meta="Compared with yesterday, or with when you last checked." />}>
      <ProfileBanner active={active} profiles={profiles} onChange={() => navigation.navigate("CareProfiles")} />
      {error && <ErrorNotice message={error} />}

      <View style={styles.choices} accessibilityRole="radiogroup">
        {FEELINGS.map((option) => {
          const selected = feeling === option;
          return (
            <Pressable
              key={option}
              onPress={() => setFeeling(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              // ⛔ State in the label: React Native Web drops accessibilityState.
              accessibilityLabel={`${FEELING_LABELS[option]}, ${selected ? "selected" : "not selected"}`}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {FEELING_LABELS[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Anything to add? (optional)"
        placeholder="In your own words"
        value={note}
        onChangeText={setNote}
        autoCapitalize="sentences"
        multiline
      />
      <AppButton label="Save check-in" onPress={() => void save()} loading={busy} disabled={!feeling} />

      {saved?.suggestSymptomCheck && (
        <View style={styles.worse}>
          <Text style={styles.body}>
            Sorry things are worse. It may be worth checking your symptoms
            again — MedHelp will suggest what level of care to consider.
          </Text>
          <AppButton label="Check my symptoms" onPress={() => navigation.navigate("SymptomIntake")} />
        </View>
      )}
      {saved && !saved.suggestSymptomCheck && <Text style={styles.body}>Saved for today.</Text>}

      <Text style={styles.heading} accessibilityRole="header">
        The last {TREND_DAYS} days
      </Text>
      <View style={styles.trend}>
        {lastDays(TREND_DAYS).map((day) => {
          const entry = byDay.get(day);
          const label = entry ? FEELING_LABELS[entry.feeling] : "No check-in";
          return (
            <View
              key={day}
              style={styles.column}
              accessible
              accessibilityLabel={`${day}: ${label}`}
            >
              <View style={[styles.bar, { height: entry ? HEIGHT[entry.feeling] : 4 }, !entry && styles.barEmpty]} />
              <Text style={styles.dayText}>{day.slice(8)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>
        Taller is "Better", shorter is "Worse". This shows what you told
        MedHelp and nothing more. If you are worried, or something new
        happens, check your symptoms or speak to a clinician. In an emergency,
        call 911.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    flexGrow: 1,
    minHeight: MIN_TAP_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  choiceText: { ...typography.bodyStrong, color: colors.textPrimary },
  choiceTextSelected: { color: colors.accent },
  worse: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  heading: { ...typography.overline, color: colors.textSecondary },
  trend: { flexDirection: "row", alignItems: "flex-end", gap: 4, minHeight: 96 },
  column: { flex: 1, alignItems: "center", gap: 2 },
  bar: { width: "100%", borderRadius: 4, backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.border },
  dayText: { ...typography.caption, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
});
