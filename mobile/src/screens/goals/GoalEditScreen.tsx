import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { ErrorNotice } from "@/components/ErrorNotice";
import {
  GoalPlanEditor,
  badTimes,
  filledActivities,
  withDerivedCadence,
  type EditableActivity,
} from "@/components/GoalPlanEditor";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/services/apiClient";
import { listGoals, updateGoal } from "@/services/goalService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "GoalEdit">;

/**
 * Change a goal that is already saved.
 *
 * Playtesting reported the obvious missing thing: the only way to alter a goal
 * was to delete it and write it again, which threw away every tick along with
 * it and meant re-typing a plan to fix one word.
 *
 * ## What this screen may and may not do
 *
 * ⛔ **It proposes nothing.** There is no description box and no call to
 * `draftGoal` — the model is not consulted here at all. Every row on screen was
 * either written by the person or already confirmed by them, and editing is not
 * an occasion for MedHelp to write more. That keeps the one place that authors
 * health content to the one screen CLAUDE.md describes.
 *
 * ⛔ **Rows keep their `id`.** That is what tells the server to edit a row in
 * place rather than replace it, and what keeps the person's ticks. Dropping an
 * id would not merely rewrite a row, it would silently discard whatever had
 * been ticked against it — so the ids are carried from the loaded goal straight
 * through to `updateGoal` and never regenerated.
 *
 * The goal's original description is not editable and is not shown as a field:
 * it is the record of what the person first wrote, not a property of the plan.
 */
export function GoalEditScreen({ navigation, route }: Props) {
  const { goalId } = route.params;

  const [title, setTitle] = useState("");
  const [activities, setActivities] = useState<EditableActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        // There is no "get one goal" endpoint, and adding one for this would be
        // a second way to read the same row. The list is already scoped to the
        // caller, so a goal that is not in it is not this person's to edit.
        const goals = await listGoals();
        if (!active) return;

        const goal = goals.find((each) => each.id === goalId);
        if (!goal) {
          setError("That goal is no longer there.");
          return;
        }

        setTitle(goal.title);
        setActivities(
          goal.activities.map((activity) => ({
            // ⛔ The id is the whole point — see the note above.
            id: activity.id,
            text: activity.text,
            cadence: activity.cadence,
            timesPerWeek: activity.timesPerWeek,
            quantityText: activity.quantityText,
            preferredTime: activity.preferredTime,
            days: activity.days,
            timeOfDay: activity.timeOfDay,
            // A saved row is the person's own, whoever first drafted it: they
            // confirmed it by pressing save. Nothing here is relabelled as
            // MedHelp's suggestion on the way back in.
            source: null,
            suggested: false,
          }))
        );
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "We couldn't load that goal right now."
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [goalId]);

  const filled = filledActivities(activities);
  const bad = badTimes(activities);
  const canSave =
    title.trim().length > 0 && filled.length > 0 && bad.length === 0 && !saving;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateGoal(goalId, {
        title: title.trim(),
        activities: filled.map((activity) =>
          withDerivedCadence({ ...activity, text: activity.text.trim() })
        ),
      });
      navigation.navigate("HealthGoals", { savedFor: title.trim() });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't save your changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppNav current="Goals" navigation={navigation}>
      <Screen wide domain="goals">
        <PageHeader
          icon="check"
          title="Edit goal"
          subtitle="Change the name, the activities, or when each one happens."
        />

        {loading ? (
          <Text style={styles.loading}>Loading your goal…</Text>
        ) : activities.length === 0 ? (
          <ErrorNotice message={error ?? "That goal is no longer there."} />
        ) : (
          <>
            <GoalPlanEditor
              title={title}
              onTitleChange={setTitle}
              activities={activities}
              onActivitiesChange={setActivities}
              disabled={saving}
            />

            {error && <ErrorNotice message={error} />}

            <AppButton
              label={saving ? "Saving…" : "Save changes"}
              onPress={save}
              loading={saving}
              disabled={!canSave}
              accessibilityHint="Saves your changes to this goal"
            />

            {/*
              The same statement the create screen carries, and for the same
              reason: with the refusal gone, a footnote is the only thing on
              screen telling a person what they are looking at. An edit screen
              is where somebody adjusts a plan MedHelp wrote, so it belongs
              here too.

              It is not the reviewed `DisclaimerBanner` — which screens show
              that is fenced in CLAUDE.md and is a reviewer's call.
            */}
            <Text style={styles.footnote}>
              MedHelp wrote these suggestions, not a doctor or nurse, and nobody
              medically qualified has checked them. Talk to a health
              professional before acting on a goal about a medical condition, a
              medicine, or a big change to how you eat or exercise.
            </Text>
          </>
        )}
      </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  loading: { ...typography.body, color: colors.textSecondary },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
