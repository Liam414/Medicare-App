import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import {
  GoalPlanEditor,
  badTimes,
  blankActivity,
  filledActivities,
  withDerivedCadence,
  type EditableActivity,
} from "@/components/GoalPlanEditor";
import { AppNav } from "@/components/AppNav";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { ApiError } from "@/services/apiClient";
import {
  createGoal,
  draftGoal,
  type Day,
  type EmergencyGuidance,
} from "@/services/goalService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "GoalCreate">;

/**
 * Write a goal, then confirm the activities MedHelp read out of it.
 *
 * ## MedHelp proposes. The person decides.
 *
 * "Suggest activities" writes nothing on the server. It returns a draft, the
 * draft lands in these fields, and the person edits it before pressing save —
 * the same read-then-confirm shape as `ReminderEditScreen`, and the same
 * reason: MedHelp must not put words in someone's mouth about their own
 * health.
 *
 * ## Two kinds of row, and the person can always tell them apart
 *
 * The usual row is one MedHelp proposed: an activity it wrote, on days it
 * picked, at a time it chose. Those rows are `generated` and they say so on
 * screen. ⛔ Never render a suggested row without that label — a person must
 * be able to tell which lines are theirs, and editing a row's text clears the
 * label because the line has become theirs.
 *
 * The other row quotes the person. It appears when the planner could not
 * answer and the server fell back to splitting what they wrote; the server
 * checked that each row quotes their text, and `sourcePhrase` is shown
 * beneath it so that is visible rather than taken on trust. Those rows carry
 * no schedule, because a time MedHelp invented would be a quantity the person
 * never wrote — the day chips and the time field start empty and they fill
 * them in.
 *
 * A draft can legitimately be empty — no model configured, an outage, or a
 * refusal. The screen then shows the server's sentence and an empty row to
 * type into. There is never a generated fallback plan.
 *
 * ## ⛔ What this screen must keep saying
 *
 * Since 2026-09-12 MedHelp proposes a plan for **any** goal, a medical one
 * included, and no deterministic check screens what it proposes. The footnote
 * above the save button is what tells the person that what they are looking
 * at was written by software and reviewed by nobody. It is not decoration.
 *
 * Nothing here interprets a goal beyond proposing activities for it. It does
 * not say whether a goal is realistic or advisable, and it never explains
 * what an activity will do for the person — a benefit claim is the app making
 * a health claim, which is the line this feature is still built around.
 */
export function GoalCreateScreen({ navigation }: Props) {
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [activities, setActivities] = useState<EditableActivity[]>([]);
  // Which rows MedHelp proposed rather than read out of the person's text.
  const [notice, setNotice] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<EmergencyGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggest = async () => {
    setError(null);
    setDrafting(true);
    try {
      const draft = await draftGoal(description);
      setEmergency(draft.emergency);
      setNotice(draft.notice);
      setTitle(draft.title ?? "");
      setActivities(
        draft.activities.length > 0
          ? draft.activities.map((activity) => ({
              text: activity.text,
              cadence: activity.cadence,
              timesPerWeek: activity.timesPerWeek,
              quantityText: activity.quantityText,
              preferredTime: activity.preferredTime,
              days: activity.days,
              timeOfDay: activity.timeOfDay,
              // Carried on the row itself rather than in a list beside it, so
              // a removal cannot leave the "Suggested by MedHelp" label on
              // somebody else's line.
              source: activity.sourcePhrase,
              suggested: activity.generated,
            }))
          : [blankActivity()]
      );
    } catch (caught) {
      // An outage is not a reason to block someone writing their own list.
      setNotice(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't read that just now. You can add your activities below."
      );
      setActivities([blankActivity()]);
    } finally {
      setDrafting(false);
    }
  };

  const filled = filledActivities(activities);
  const bad = badTimes(activities);

  const canSave =
    title.trim().length > 0 && filled.length > 0 && bad.length === 0 && !saving;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await createGoal({
        title: title.trim(),
        description: description.trim() || title.trim(),
        activities: filled.map((activity) =>
          withDerivedCadence({ ...activity, text: activity.text.trim() })
        ),
      });
      navigation.navigate("HealthGoals", { savedFor: title.trim() });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't save that goal. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppNav current="Goals" navigation={navigation}>
    <Screen wide domain="goals">
      <PageHeader
        title="Add a goal"
        subtitle="Write what you want to work towards. MedHelp will suggest a plan and a weekly schedule you can change."
      />

      {/* Above everything else, and never suppressed by a later failure. */}
      {emergency && (
        <View style={styles.emergency}>
          <Text style={styles.emergencyHeadline}>{emergency.headline}</Text>
          <Text style={styles.emergencyAction}>{emergency.action}</Text>
          <EmergencyCallBar />
        </View>
      )}

      <TextField
        label="What would you like to work towards?"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="For example: I want to sleep better and get outdoors more"
        hint="Write it however you like. MedHelp will suggest a few everyday activities and the days and times to do them. Every row is yours to change, and nothing is saved until you press save."
      />

      <AppButton
        label={drafting ? "Working it out…" : "Suggest a plan"}
        onPress={suggest}
        loading={drafting}
        disabled={description.trim().length === 0 || drafting}
        variant="secondary"
        accessibilityHint="Suggests activities and a weekly schedule you can edit. Nothing is saved yet."
      />

      {notice && <Text style={styles.notice}>{notice}</Text>}

      {activities.length > 0 && (
        <View style={styles.editor}>
          <GoalPlanEditor
            title={title}
            onTitleChange={setTitle}
            activities={activities}
            onActivitiesChange={setActivities}
            disabled={saving}
          />

          {error && <ErrorNotice message={error} />}

          <AppButton
            label={saving ? "Saving…" : "Save goal"}
            onPress={save}
            loading={saving}
            disabled={!canSave}
            accessibilityHint="Saves this goal and its activities"
          />
          {/*
            ⛔ This replaced "MedHelp does not decide what your goals should
            be", which stopped being true on 2026-09-12 when the app started
            proposing plans for any goal. A statement about the software that
            no longer describes the software is worse than none, and this one
            sits where a person reads it before saving an authored plan.

            It is not the reviewed `DisclaimerBanner`, which this screen has
            never carried — which screens show that is fenced in CLAUDE.md and
            is a reviewer's call, not a layout one.
          */}
          <Text style={styles.footnote}>
            These suggestions were written by MedHelp, not by a doctor or nurse.
            Nobody medically qualified has checked them or knows anything about
            your health. Change anything that does not suit you, and speak to a
            healthcare professional before acting on a goal about a medical
            condition, a medicine, or a big change to what you eat or how you
            exercise.
          </Text>
        </View>
      )}
    </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  emergency: {
    backgroundColor: colors.emergencySurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emergencyHeadline: { ...typography.title, color: colors.emergencyText },
  emergencyAction: { ...typography.body, color: colors.emergencyText },
  notice: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  editor: { marginTop: spacing.lg, gap: spacing.md },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
