import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { ScreenBand } from "@/components/ScreenBand";
import { SuccessNotice } from "@/components/SuccessNotice";
import { ApiError } from "@/services/apiClient";
import { PAST_TIER_LABELS, listPastAssessments, type PastAssessment } from "@/services/intakeService";
import { listMedications, type Medication } from "@/services/medicationService";
import { buildVisitSummary, shareSummary } from "@/services/visitSummary";
import { BORDER_WIDTH, MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "VisitSummary">;

const SHARE_OUTCOME: Record<string, string> = {
  shared: "Shared.",
  copied: "Copied. Paste it wherever you need it.",
};

/**
 * ⛔ The person chooses what goes in, sees exactly what will be shared, and
 * sends it themselves. Nothing leaves the device except through their own
 * share sheet, and the preview is the text — not a rendering of it.
 */
export function VisitSummaryScreen({ navigation }: Props) {
  const [assessments, setAssessments] = useState<PastAssessment[] | null>(null);
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [includeMedications, setIncludeMedications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listPastAssessments(), listMedications()])
      .then(([past, meds]) => {
        setAssessments(past);
        setMedications(meds);
      })
      .catch((caught) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "We couldn't load what you've saved. Please try again in a moment."
        )
      );
  }, []);

  const text = useMemo(
    () =>
      buildVisitSummary({
        assessments: (assessments ?? []).filter((a) => !excluded.has(a.id)),
        medications: includeMedications ? medications ?? [] : null,
        preparedOn: new Date(),
      }),
    [assessments, medications, excluded, includeMedications]
  );

  const toggle = (id: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const share = async () => {
    setOutcome(null);
    const result = await shareSummary(text, (content) => Share.share(content));
    if (result === "failed") setError("This device couldn't share or copy the summary.");
    else setOutcome(SHARE_OUTCOME[result] ?? null);
  };

  return (
    <AppNav current="Symptoms" navigation={navigation}>
      <Screen
        band={
          <ScreenBand
            title="Visit summary"
            meta="Your own words and the medications you recorded, set out for a clinician. MedHelp adds headings only."
          />
        }
      >
        {error && <ErrorNotice message={error} />}
        {outcome && <SuccessNotice message={outcome} />}

        <Text style={styles.heading}>Include</Text>
        {(assessments ?? []).map((item) => {
          const included = !excluded.has(item.id);
          const when = new Date(item.createdAt).toLocaleDateString();
          return (
            <Toggle
              key={item.id}
              on={included}
              label={`${when} — ${PAST_TIER_LABELS[item.tier]}`}
              detail={item.description}
              onPress={() => toggle(item.id)}
            />
          );
        })}
        <Toggle
          on={includeMedications}
          label="My medications"
          detail="Names, doses and directions exactly as you entered them"
          onPress={() => setIncludeMedications((on) => !on)}
        />

        <Text style={styles.heading}>What will be shared</Text>
        <View style={styles.preview}>
          <Text style={styles.previewText} selectable>
            {text}
          </Text>
        </View>

        <AppButton
          label="Share or copy"
          accessibilityHint="Opens your device's share options; nothing is sent until you choose where"
          disabled={assessments === null}
          onPress={() => void share()}
        />
      </Screen>
    </AppNav>
  );
}

function Toggle({
  on,
  label,
  detail,
  onPress,
}: {
  on: boolean;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      // ⛔ State in the label: React Native Web drops accessibilityState.
      accessibilityLabel={`${label}, ${on ? "included" : "not included"}`}
      style={[styles.toggle, on && styles.toggleOn]}
    >
      <Text style={styles.toggleMark}>{on ? "✓" : ""}</Text>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDetail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.overline, color: colors.textSecondary },
  toggle: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    minHeight: MIN_TAP_TARGET,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toggleOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  toggleMark: { ...typography.bodyStrong, width: 20, color: colors.accent },
  toggleText: { flex: 1, gap: spacing.xs },
  toggleLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  toggleDetail: { ...typography.caption, color: colors.textSecondary },
  preview: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  previewText: { ...typography.body, color: colors.textPrimary },
});
