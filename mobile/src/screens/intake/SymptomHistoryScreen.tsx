import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { ApiError } from "@/services/apiClient";
import {
  PAST_TIER_LABELS,
  deletePastAssessment,
  listPastAssessments,
  type PastAssessment,
} from "@/services/intakeService";
import { BORDER_WIDTH, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomHistory">;

/**
 * The descriptions a person chose to save, read back to them.
 *
 * ⛔ Each card is what they were shown at the time — their words, the tier,
 * the reasoning — and nothing is re-assessed. There is no trend, no count and
 * no "you have described headaches three times": grouping someone's symptoms
 * into a pattern is a clinical observation this app does not make.
 */
export function SymptomHistoryScreen({ navigation }: Props) {
  const [items, setItems] = useState<PastAssessment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listPastAssessments());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't load your past descriptions. Please try again in a moment."
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const remove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await deletePastAssessment(id);
      setItems((current) => (current ?? []).filter((item) => item.id !== id));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't remove that description. Please try again in a moment."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppNav current="Symptoms" navigation={navigation}>
      <Screen
        band={
          <ScreenBand
            title="Past descriptions"
            meta="Only the ones you chose to save. Each is shown as it was at the time — MedHelp does not re-assess them."
          />
        }
      >
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {items === null && !error && (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Loading your past descriptions…</Text>
          </View>
        )}

        {items !== null && items.length > 0 && (
          <AppButton
            label="Make a visit summary"
            accessibilityHint="Sets out what you described and your medications, to share with a clinician"
            onPress={() => navigation.navigate("VisitSummary")}
          />
        )}

        {items !== null && items.length === 0 && (
          <EmptyState
            icon="symptom"
            title="Nothing saved yet"
            description={
              "When you describe how you feel, you can choose to save it. " +
              "Saved descriptions appear here so you can show them to a clinician."
            }
          />
        )}

        {(items ?? []).map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.tier}>MedHelp's estimate: {PAST_TIER_LABELS[item.tier]}</Text>
            <Text style={styles.label}>Your description, with your answers added</Text>
            <Text style={styles.quoted}>{item.description}</Text>
            {item.summary?.understood.map((entry) => (
              <Text key={entry.label} style={styles.muted}>
                {entry.label}: {entry.value}
              </Text>
            ))}
            <AppButton
              label="Remove"
              variant="secondary"
              loading={busyId === item.id}
              accessibilityHint="Deletes this saved description from MedHelp"
              onPress={() => void remove(item.id)}
            />
          </View>
        ))}
      </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderWidth: BORDER_WIDTH,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  date: { ...typography.overline, color: colors.textSecondary },
  tier: { ...typography.titleSmall, color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary },
  quoted: { ...typography.bodyQuoted, color: colors.textPrimary },
  muted: { ...typography.body, color: colors.textSecondary },
});
