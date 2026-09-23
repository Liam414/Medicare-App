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
  FOLLOW_UP_KIND_LABELS,
  createFollowUp,
  deleteFollowUp,
  listFollowUps,
  setFollowUpDone,
  type FollowUp,
  type FollowUpKind,
} from "@/services/followUpService";
import { localDay } from "@/services/medicationService";
import { rearm } from "@/services/reminderArming";
import { validateIsoDate } from "@/utils/validation";
import { BORDER_WIDTH, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "FollowUps">;

const QUICK: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In 1 week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDay(d);
}

/**
 * Follow-up care the person wants reminding about — "your doctor wanted you
 * back in 2 weeks", a check-in after a visit. In their own words; MedHelp
 * reminds on the day and never decides when anyone should be seen.
 */
export function FollowUpsScreen({ navigation }: Props) {
  const { active, profiles, ready, profileId } = useActiveProfile();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [kind, setKind] = useState<FollowUpKind>("return_visit");
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState(inDays(14));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listFollowUps(profileId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't load your follow-ups.");
    }
  }, [profileId]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
      // Alerts on the due day are armed with everything else, in one call.
      void rearm();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const dateError = validateIsoDate(dueOn) ?? (dueOn.trim() ? null : "Choose a date.");
    if (!title.trim() || dateError) {
      setError(title.trim() ? dateError : "Say what the follow-up is, in your own words.");
      return;
    }
    void act(async () => {
      await createFollowUp(profileId, { kind, title: title.trim(), dueOn: dueOn.trim() });
      setTitle("");
    });
  };

  const today = localDay();

  return (
    <Screen band={<ScreenBand title="Follow-ups" meta="Reminders for care you've been asked to come back for." />}>
      <ProfileBanner active={active} profiles={profiles} onChange={() => navigation.navigate("CareProfiles")} />
      {error && <ErrorNotice message={error} />}

      {items.length === 0 ? (
        <Text style={styles.body}>No follow-ups yet.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.caption}>
              {FOLLOW_UP_KIND_LABELS[item.kind]} ·{" "}
              {item.doneOn
                ? `Done ${item.doneOn}`
                : item.dueOn === today
                  ? "Due today"
                  : item.dueOn < today
                    ? `Was due ${item.dueOn}`
                    : `Due ${item.dueOn}`}
            </Text>
            <View style={styles.row}>
              <AppButton
                label={item.doneOn ? "Not done yet" : "Mark done"}
                variant="outline"
                disabled={busy}
                accessibilityHint={item.title}
                onPress={() => void act(() => setFollowUpDone(item.id, !item.doneOn))}
              />
              <AppButton
                label="Remove"
                variant="secondary"
                disabled={busy}
                accessibilityHint={item.title}
                onPress={() => void act(() => deleteFollowUp(item.id))}
              />
            </View>
          </View>
        ))
      )}

      <Text style={styles.heading} accessibilityRole="header">
        Add a follow-up
      </Text>
      <SegmentedControl
        segments={(Object.keys(FOLLOW_UP_KIND_LABELS) as FollowUpKind[]).map((key) => ({
          key,
          label: FOLLOW_UP_KIND_LABELS[key],
        }))}
        selected={kind}
        onSelect={(key) => setKind(key as FollowUpKind)}
      />
      <TextField
        label="What is it?"
        placeholder={'e.g. "Back to Dr Lee about my knee"'}
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
      />
      <View style={styles.row}>
        {QUICK.map((quick) => (
          <AppButton
            key={quick.label}
            label={quick.label}
            variant="secondary"
            onPress={() => setDueOn(inDays(quick.days))}
          />
        ))}
      </View>
      <TextField label="When" placeholder="YYYY-MM-DD" value={dueOn} onChangeText={setDueOn} />
      <AppButton label="Add follow-up" onPress={add} loading={busy} />
      <Text style={styles.caption}>
        MedHelp reminds you on the day. It doesn't contact anyone and doesn't
        decide when you should be seen.
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
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
});
