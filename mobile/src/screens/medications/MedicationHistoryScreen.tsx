import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import {
  MedicationError,
  getMedicationHistory,
  localDay,
  markDose,
  unmarkDose,
  type Dose,
  type DoseStatus,
  type MedicationHistory,
} from "@/services/medicationService";
import { listSchedules } from "@/services/reminderService";
import { formatTimeOfDay } from "@/services/reminderTiming";
import { BORDER_WIDTH, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationHistory">;

const DAYS_SHOWN = 7;

// ⛔ The only three words a slot can carry. "Not marked" is what an untapped
// time is — never "missed": MedHelp does not know whether it was taken.
export const SLOT_LABEL: Record<DoseStatus | "none", string> = {
  taken: "Taken",
  skipped: "Skipped",
  none: "Not marked",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  dosage: "Dose",
  frequency: "Directions",
  started_on: "Started on",
  stopped_on: "Stopped on",
};

function lastDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    return localDay(d);
  });
}

/**
 * What the person has recorded about one medication.
 *
 * ⛔ Not an adherence record: no counts, percentages, streaks or "3 of 4".
 * Each slot says what was tapped, or "Not marked". Nothing here advises
 * starting, stopping or changing anything.
 */
export function MedicationHistoryScreen({ route }: Props) {
  const { medicationId } = route.params;
  const [history, setHistory] = useState<MedicationHistory | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loaded, schedules] = await Promise.all([
        getMedicationHistory(medicationId),
        listSchedules().catch(() => []),
      ]);
      setHistory(loaded);
      const schedule = schedules.find((s) => s.medicationId === medicationId);
      const enabled = (schedule?.reminders ?? []).filter((r) => r.enabled).map((r) => r.timeOfDay);
      // No reminder times: one untimed slot per day, so a dose can still be marked.
      setTimes(enabled.length ? enabled.sort() : [""]);
    } catch (caught) {
      setError(caught instanceof MedicationError ? caught.message : "We couldn't load this history.");
    }
  }, [medicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const find = (day: string, time: string): Dose | undefined =>
    history?.doses.find((d) => d.takenOn === day && d.timeOfDay === time);

  const record = async (day: string, time: string, status: DoseStatus | null) => {
    const key = `${day}|${time}`;
    setBusySlot(key);
    setError(null);
    try {
      const existing = find(day, time);
      if (status === null && existing) await unmarkDose(medicationId, existing.id);
      else if (status) await markDose(medicationId, day, time, status);
      await load();
    } catch (caught) {
      setError(caught instanceof MedicationError ? caught.message : "We couldn't save that.");
    } finally {
      setBusySlot(null);
    }
  };

  if (!history && !error) {
    return (
      <Screen band={<ScreenBand title="History" />}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const today = localDay();

  return (
    <Screen
      band={
        <ScreenBand
          title="History"
          meta="What you've marked, and what has changed. Anything you didn't mark says “Not marked”."
        />
      }
    >
      {error && <ErrorNotice message={error} onRetry={load} />}

      {history && (
        <>
          <View style={styles.dates}>
            <Text style={styles.body}>Started on: {history.startedOn ?? "Not recorded"}</Text>
            <Text style={styles.body}>Stopped on: {history.stoppedOn ?? "Not recorded"}</Text>
          </View>

          {lastDays(DAYS_SHOWN).map((day) => (
            <View key={day} style={styles.day}>
              <Text style={styles.heading} accessibilityRole="header">
                {day === today ? "Today" : day}
              </Text>
              {times.map((time) => {
                const dose = find(day, time);
                const label = SLOT_LABEL[dose?.status ?? "none"];
                const slotName = time ? formatTimeOfDay(time) : "Any time";
                const busy = busySlot === `${day}|${time}`;
                return (
                  <View key={time || "any"} style={styles.slot}>
                    <Text style={styles.body}>
                      {slotName}: {label}
                    </Text>
                    {day === today &&
                      (dose ? (
                        <AppButton
                          label="Undo"
                          variant="secondary"
                          loading={busy}
                          accessibilityHint={`Sets ${slotName} back to not marked`}
                          onPress={() => void record(day, time, null)}
                        />
                      ) : (
                        <View style={styles.actions}>
                          <AppButton
                            label="Taken"
                            variant="outline"
                            loading={busy}
                            accessibilityHint={`Marks the ${slotName} dose as taken`}
                            onPress={() => void record(day, time, "taken")}
                          />
                          <AppButton
                            label="Skipped"
                            variant="secondary"
                            disabled={busy}
                            accessibilityHint={`Marks the ${slotName} dose as skipped`}
                            onPress={() => void record(day, time, "skipped")}
                          />
                        </View>
                      ))}
                  </View>
                );
              })}
            </View>
          ))}

          <View style={styles.day}>
            <Text style={styles.heading} accessibilityRole="header">
              Changes
            </Text>
            {history.changes.length === 0 ? (
              <Text style={styles.body}>No changes recorded.</Text>
            ) : (
              history.changes.map((change) => (
                <View key={change.changedAt} style={styles.slot}>
                  <Text style={styles.caption}>{change.changedAt.slice(0, 10)}</Text>
                  {Object.entries(change.changes).map(([field, [before, after]]) => (
                    <Text key={field} style={styles.body}>
                      {FIELD_LABEL[field] ?? field}: {String(before ?? "—")} → {String(after ?? "—")}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </View>

          <Text style={styles.caption}>
            MedHelp records what you tell it and never advises starting,
            stopping or changing a medicine. Talk to your doctor or pharmacist
            about any change.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dates: { gap: spacing.xs },
  day: { gap: spacing.sm },
  slot: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heading: { ...typography.overline, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
});
