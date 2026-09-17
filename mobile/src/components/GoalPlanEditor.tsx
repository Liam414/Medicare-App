/**
 * The editable plan: a goal's name, its activities, and each one's schedule.
 *
 * Extracted from `GoalCreateScreen` when goals became editable after saving.
 * Playtesting reported that changing a goal meant deleting it and writing it
 * again, and the same editor is needed in both places — duplicating it would
 * have meant two copies of the day chips, the time validation and the
 * accessibility note below, drifting apart from the day they were copied.
 *
 * ## The rows carry their own labels
 *
 * `source` and `suggested` used to be arrays held beside `activities` in the
 * create screen and indexed by position, so every add and remove had to
 * re-slice all three in step. One row object holds all of it here, which is
 * what stops a "Suggested by MedHelp" label ending up on the wrong line after
 * a removal. ⛔ That label is required on any row the app wrote — see
 * CLAUDE.md — so which row it belongs to is a correctness question, not
 * cosmetics.
 *
 * `id` is carried through untouched. It is what tells the server to edit a row
 * in place and keep the person's ticks rather than replace it; see
 * `updateGoal`.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { TextField } from "@/components/TextField";
import { DAYS, shortDay, type ActivityInput, type Day } from "@/services/goalService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/** A time is either a 24-hour HH:MM or nothing at all. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface EditableActivity extends ActivityInput {
  /** Present when this row already exists on a saved goal. */
  id?: string;
  /** The person's own words this row was read out of, if it was. */
  source?: string | null;
  /** True while this row is still MedHelp's suggestion rather than theirs. */
  suggested?: boolean;
}

export function blankActivity(): EditableActivity {
  return {
    text: "",
    cadence: "unspecified",
    timesPerWeek: null,
    quantityText: null,
    preferredTime: "unspecified",
    days: [],
    timeOfDay: null,
  };
}

/** Rows with any text in them — the ones that would actually be saved. */
export function filledActivities(rows: EditableActivity[]): EditableActivity[] {
  return rows.filter((row) => row.text.trim().length > 0);
}

/**
 * Keep the cadence in step with the days that were ticked.
 *
 * The server derives these for a plan it proposed, and derives them again on an
 * edit rather than trusting what it is sent — see `update_goal`. A row the
 * person typed or re-ticked has to have them worked out on the client too, or
 * the schedule line would read "whenever you choose" beside three ticked days
 * until the next reload.
 */
export function withDerivedCadence<T extends ActivityInput>(activity: T): T {
  if (activity.days.length === 0) return activity;
  if (activity.days.length === DAYS.length) {
    return { ...activity, cadence: "daily", timesPerWeek: null };
  }
  return { ...activity, cadence: "times_per_week", timesPerWeek: activity.days.length };
}

/**
 * Rows whose time is set but unreadable.
 *
 * Checked on the client as well as the server so someone who mistypes a time
 * is told on the screen they typed it on, rather than by a 422 after saving.
 */
export function badTimes(rows: EditableActivity[]): EditableActivity[] {
  return filledActivities(rows).filter(
    (row) => row.timeOfDay && !TIME_PATTERN.test(row.timeOfDay)
  );
}

interface Props {
  title: string;
  onTitleChange: (title: string) => void;
  activities: EditableActivity[];
  onActivitiesChange: (activities: EditableActivity[]) => void;
  /** Hidden while a save is in flight. */
  disabled?: boolean;
}

export function GoalPlanEditor({
  title,
  onTitleChange,
  activities,
  onActivitiesChange,
  disabled = false,
}: Props) {
  const updateText = (index: number, text: string) => {
    onActivitiesChange(
      activities.map((row, at) =>
        at === index
          ? // Once edited it is the person's line: it no longer quotes anything
            // and it stops being labelled as MedHelp's.
            { ...row, text, source: null, suggested: false }
          : row
      )
    );
  };

  /**
   * Add or remove one day from a row's schedule.
   *
   * Rebuilt from `DAYS` rather than pushed onto, so the list stays in week
   * order however the chips were tapped and a schedule reads the same way
   * every time.
   */
  const toggleDay = (index: number, day: Day) => {
    onActivitiesChange(
      activities.map((row, at) => {
        if (at !== index) return row;
        const picked = new Set(row.days);
        if (picked.has(day)) picked.delete(day);
        else picked.add(day);
        return { ...row, days: DAYS.filter((each) => picked.has(each)) };
      })
    );
  };

  const updateTime = (index: number, timeOfDay: string) => {
    onActivitiesChange(
      activities.map((row, at) =>
        at === index ? { ...row, timeOfDay: timeOfDay.trim() || null } : row
      )
    );
  };

  const removeActivity = (index: number) => {
    onActivitiesChange(activities.filter((_, at) => at !== index));
  };

  return (
    <View style={styles.editor}>
      <TextField
        label="Goal name"
        value={title}
        onChangeText={onTitleChange}
        placeholder="For example: Getting outdoors more"
        editable={!disabled}
      />

      <Text style={styles.sectionLabel}>Activities to track</Text>
      {activities.map((activity, index) => (
        <View key={activity.id ?? `new-${index}`} style={styles.activityRow}>
          <TextField
            label={`Activity ${index + 1}`}
            value={activity.text}
            onChangeText={(text) => updateText(index, text)}
            placeholder="Something you plan to do"
            editable={!disabled}
          />
          {activity.source ? (
            <Text style={styles.source}>From your words: “{activity.source}”</Text>
          ) : activity.suggested ? (
            <Text style={styles.suggested}>
              Suggested by MedHelp — edit it or remove it
            </Text>
          ) : null}

          {/*
            The daily schedule. Every day is a separate toggle rather than a
            "weekdays" shortcut: a shortcut would be MedHelp deciding which
            days someone's week is made of.
          */}
          <Text style={styles.scheduleLabel}>Which days?</Text>
          <View style={styles.days}>
            {DAYS.map((day) => {
              const picked = activity.days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(index, day)}
                  disabled={disabled}
                  style={[styles.day, picked && styles.dayPicked]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  // ⛔ THE STATE IS IN THE LABEL AS WELL AS IN
                  // `accessibilityState`, AND BOTH ARE NEEDED.
                  //
                  // Checked against the deployed site on 2026-09-12: every
                  // chip rendered with `aria-checked` null, because this
                  // version of React Native Web does not map
                  // `accessibilityState` onto the DOM. The days were ticked
                  // correctly and looked right — filled in the accent colour —
                  // but a screen reader was told nothing at all about which
                  // days the plan had chosen.
                  //
                  // Putting it in the label is the one thing that works on
                  // every platform without depending on what RNW happens to
                  // emit. `accessibilityState` stays because it is the right
                  // thing on native.
                  accessibilityLabel={
                    `${day} for activity ${index + 1}, ` +
                    (picked ? "selected" : "not selected")
                  }
                >
                  <Text style={[styles.dayText, picked && styles.dayTextPicked]}>
                    {shortDay(day)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="At what time?"
            value={activity.timeOfDay ?? ""}
            onChangeText={(time) => updateTime(index, time)}
            placeholder="08:00"
            hint="24-hour clock, like 08:00 or 18:30. Leave it blank for no set time."
            editable={!disabled}
          />
          {activity.timeOfDay && !TIME_PATTERN.test(activity.timeOfDay) && (
            <Text style={styles.badTime}>
              Enter the time as HH:MM on a 24-hour clock, like 08:00.
            </Text>
          )}

          {activities.length > 1 && (
            <Pressable
              onPress={() => removeActivity(index)}
              disabled={disabled}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Remove activity ${index + 1}`}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          )}
        </View>
      ))}

      <AppButton
        label="Add another activity"
        onPress={() => onActivitiesChange([...activities, blankActivity()])}
        variant="secondary"
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { marginTop: spacing.lg, gap: spacing.md },
  sectionLabel: { ...typography.titleSmall, color: colors.textPrimary },
  activityRow: { gap: spacing.xs },
  source: { ...typography.caption, color: colors.textSecondary },
  suggested: { ...typography.caption, color: colors.accent },
  scheduleLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  days: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  day: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPicked: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayText: { ...typography.caption, color: colors.textSecondary },
  dayTextPicked: { color: colors.surface },
  badTime: { ...typography.caption, color: colors.errorText },
  remove: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
  },
  removeText: { ...typography.body, color: colors.textSecondary },
});
