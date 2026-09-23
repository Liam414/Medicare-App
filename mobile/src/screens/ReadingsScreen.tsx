import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ProfileBanner } from "@/components/ProfileBanner";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { ApiError } from "@/services/apiClient";
import {
  READING_KINDS,
  READING_LABELS,
  READING_UNITS,
  formatReading,
  listReadings,
  logReading,
  setTarget,
  type Reading,
  type ReadingKind,
  type ReadingSummary,
} from "@/services/followUpService";
import { localDay } from "@/services/medicationService";
import { BORDER_WIDTH, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Readings">;

/**
 * Readings the person logs, beside the target their clinician gave them.
 *
 * ⛔ Shown side by side and never compared. No colour, badge or word says a
 * reading is high, low, on target or off it — interpreting a clinical value
 * is not something this app may do. The target is their words, verbatim.
 */
export function ReadingsScreen({ navigation, route }: Props) {
  const { active, profiles, ready, profileId } = useActiveProfile();
  const [kind, setKind] = useState<ReadingKind>(route.params?.kind ?? "blood_pressure");
  const [summaries, setSummaries] = useState<ReadingSummary[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [unit, setUnit] = useState("kg");
  const [targetText, setTargetText] = useState("");
  const [every, setEvery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await listReadings(profileId);
      setSummaries(body.summaries);
      setReadings(body.readings);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't load your readings.");
    }
  }, [profileId]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const summary = summaries.find((s) => s.kind === kind);
  useEffect(() => {
    setTargetText(summary?.targetText ?? "");
    setEvery(summary?.remindEveryDays ? String(summary.remindEveryDays) : "");
    setFirst("");
    setSecond("");
    if (kind !== "blood_pressure") setUnit(READING_UNITS[kind][0]);
  }, [kind, summary?.targetText, summary?.remindEveryDays]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const log = () =>
    run(async () => {
      const takenOn = localDay();
      if (kind === "blood_pressure") {
        await logReading(profileId, { kind, takenOn, systolic: Number(first), diastolic: Number(second) });
      } else {
        await logReading(profileId, { kind, takenOn, value: Number(first), unit });
      }
      setFirst("");
      setSecond("");
    });

  const saveTarget = () =>
    run(() => setTarget(profileId, kind, targetText, every.trim() ? Number(every) : null));

  const shown = readings.filter((r) => r.kind === kind).slice(0, 10);

  return (
    <Screen band={<ScreenBand title="Readings" meta="Log readings and keep the target your clinician gave you." />}>
      <ProfileBanner active={active} profiles={profiles} onChange={() => navigation.navigate("CareProfiles")} />
      {error && <ErrorNotice message={error} />}

      <SegmentedControl
        segments={READING_KINDS.map((k) => ({ key: k, label: READING_LABELS[k] }))}
        selected={kind}
        onSelect={(key) => setKind(key as ReadingKind)}
      />

      <View style={styles.card}>
        <Text style={styles.body}>
          Your target: {summary?.targetText ?? "Not recorded"}
        </Text>
        {summary?.due && (
          <Text style={styles.body}>
            {summary.daysSince === null
              ? "No reading logged yet."
              : `No reading logged in ${summary.daysSince} days.`}{" "}
            You asked to be reminded every {summary.remindEveryDays} days.
          </Text>
        )}
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        Log a reading for today
      </Text>
      {kind === "blood_pressure" ? (
        <View style={styles.row}>
          <TextField label="Top number" value={first} onChangeText={setFirst} keyboardType="number-pad" />
          <TextField label="Bottom number" value={second} onChangeText={setSecond} keyboardType="number-pad" />
        </View>
      ) : (
        <>
          <TextField label={READING_LABELS[kind]} value={first} onChangeText={setFirst} keyboardType="decimal-pad" />
          {READING_UNITS[kind].length > 1 && (
            <SegmentedControl
              segments={READING_UNITS[kind].map((u) => ({ key: u, label: u }))}
              selected={unit}
              onSelect={setUnit}
            />
          )}
        </>
      )}
      <AppButton label="Save reading" onPress={() => void log()} loading={busy} disabled={!first.trim()} />

      <Text style={styles.heading} accessibilityRole="header">
        Recent
      </Text>
      {shown.length === 0 ? (
        <Text style={styles.body}>No readings yet.</Text>
      ) : (
        shown.map((r) => (
          <Text key={r.id} style={styles.body}>
            {r.takenOn}: {formatReading(r)}
          </Text>
        ))
      )}

      <Text style={styles.heading} accessibilityRole="header">
        Target and reminder
      </Text>
      <TextField
        label="Target, as your clinician gave it"
        placeholder='e.g. "130/80"'
        value={targetText}
        onChangeText={setTargetText}
        hint="Optional. MedHelp shows it back exactly as you type it and never sets one."
      />
      <TextField
        label="Remind me to log a reading every … days"
        placeholder="e.g. 3"
        value={every}
        onChangeText={setEvery}
        keyboardType="number-pad"
        hint="Optional."
      />
      <AppButton label="Save target" variant="secondary" onPress={() => void saveTarget()} disabled={busy} />

      <Text style={styles.caption}>
        MedHelp doesn't interpret readings. If a reading worries you, speak to
        your clinician — and if you feel very unwell, call 911.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heading: { ...typography.overline, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
});
