import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ProfileBanner } from "@/components/ProfileBanner";
import { QuickFillChips } from "@/components/QuickFillChips";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { ApiError, requestAppointment } from "@/services/appointmentService";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AppointmentRequest">;

const TIER_LABELS: Record<string, string> = {
  EMERGENT: "Emergency",
  URGENT: "Urgent — be seen soon",
  SELF_CARE: "Usually self-care",
};

/**
 * Reasons offered as one tap instead of typing.
 *
 * ⛔ THESE ARE VISIT TYPES, NOT SYMPTOMS, AND THAT IS THE WHOLE POINT.
 *
 * "Follow-up visit" and "Prescription refill" say what KIND of appointment
 * somebody wants. They name no condition, no symptom and no body part, so this
 * list is administrative vocabulary rather than clinical vocabulary — which is
 * why it can live here without the review the symptom picker needed.
 *
 * ⛔ Do not add a symptom to this list. The moment an option reads "Chest
 * pain" or "Rash", this becomes a second app-authored clinical vocabulary,
 * sitting on a screen that never went through the review the first one is
 * still waiting for. Somebody who wants to say what is wrong types it, or
 * arrives here from the symptom check with the reason already filled in.
 * `AppointmentRequestScreen.test.tsx` asserts the list stays administrative.
 */
export const VISIT_REASONS: readonly string[] = [
  "New problem",
  "Follow-up visit",
  "Check-up",
  "Prescription refill",
  "Test results",
  "Vaccination",
  "Referral",
];

/**
 * Preferred times offered as one tap instead of typing.
 *
 * ⛔ NOT A SLOT PICKER, AND MUST NEVER BECOME ONE. See the note on
 * `QuickFillChips`. These are words for a preference the user will say to a
 * receptionist themselves; MedHelp has no availability data and anything it
 * offered as an actual time would be invented. `preferred_time` stays the free
 * text CLAUDE.md describes — "Thursday morning", "as soon as possible" — and
 * nothing here turns it into a datetime.
 */
export const PREFERRED_TIMES: readonly string[] = [
  "As soon as possible",
  "Today if possible",
  "Tomorrow",
  "This week",
  "Next week",
  "Weekday morning",
  "Weekday afternoon",
  "After work",
];

export function AppointmentRequestScreen({ navigation, route }: Props) {
  const { provider, intake } = route.params;

  // Prefilled from the symptom check when the user came from one, and freely
  // editable. Prefilled-but-locked would be worse than not prefilling: the
  // description was written for a triage question, not for a receptionist,
  // and the user is the one who knows what they want to say.
  const [reason, setReason] = useState(intake?.reasonForVisit ?? "");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const { active, profiles, ready, profileId } = useActiveProfile();
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setReasonError("Enter what you'd like to be seen about.");
      return;
    }
    setReasonError(null);
    setError(null);
    setSaving(true);

    try {
      const appointment = await requestAppointment({
        providerName: provider.name,
        providerNpi: provider.npi,
        providerSpecialty: provider.specialty,
        providerPhone: provider.phone,
        providerAddress: provider.address,
        reasonForVisit: reason.trim(),
        preferredTime: preferredTime.trim() || null,
        notes: notes.trim() || null,
        urgencyTier: intake?.tier ?? null,
        sourceAssessmentId: intake?.assessmentId ?? null,
      }, profileId);
      // `replace`, not `navigate`: going "back" to a form that has already
      // been submitted invites a second identical record.
      navigation.replace("AppointmentConfirmation", { appointment });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't save this appointment. Please try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen domain="care">
      <ProfileBanner
        active={active}
        profiles={profiles}
        onChange={() => navigation.navigate("CareProfiles")}
      />
      <View style={styles.provider}>
        <Text style={styles.providerLabel}>Requesting an appointment with</Text>
        <Text style={styles.providerName}>{provider.name}</Text>
        {provider.address && (
          <Text style={styles.providerMeta}>{provider.address}</Text>
        )}
      </View>

      {/*
        Said before the form, not after it. Someone who fills in a reason and a
        preferred time reasonably assumes they are sending a request somewhere;
        finding out afterwards that they still have to phone is the kind of
        surprise that gets a person's appointment missed.
      */}
      <View style={styles.notice} accessibilityRole="summary" accessible>
        <Text style={styles.noticeHeading}>MedHelp can't contact the clinic</Text>
        <Text style={styles.noticeBody}>
          Saving this records the visit in MedHelp for you to keep track of. It
          does not reach {provider.name}
          {provider.phone ? `, so please call ${provider.phone} to arrange a time.` : "."}
        </Text>
      </View>

      {intake && (
        <View style={styles.context}>
          <Text style={styles.contextHeading}>
            Carried over from your symptom check
          </Text>
          <Text style={styles.contextBody}>
            MedHelp suggested: {TIER_LABELS[intake.tier] ?? intake.tier}. That
            is recorded with this appointment as background. Edit the reason
            below to whatever you'd rather say to the clinic.
          </Text>
        </View>
      )}

      <TextField
        label="Reason for visit"
        value={reason}
        onChangeText={setReason}
        error={reasonError}
        hint="What you'd like to be seen about. Stays in MedHelp."
        multiline
        autoCapitalize="sentences"
      />

      {/*
        ⛔ NOT SHOWN WHEN THE REASON CAME FROM THE SYMPTOM CHECK.

        Tapping a chip replaces the field, and the carried-over description is
        the one thing on this screen the person did not have to write twice.
        Offering a button that silently wipes it would be a trap — and the
        chips are a shortcut for somebody starting from an empty box, which is
        exactly who this is not.
      */}
      {!intake && (
        <QuickFillChips
          label="Or pick a common reason"
          options={VISIT_REASONS}
          value={reason}
          onSelect={(text) => {
            setReason(text);
            if (text) setReasonError(null);
          }}
          disabled={saving}
          testGroup="reason"
        />
      )}

      <TextField
        label="Preferred time (optional)"
        value={preferredTime}
        onChangeText={setPreferredTime}
        hint="For example, 'Thursday morning' or 'as soon as possible'."
        placeholder="Thursday morning"
        autoCapitalize="sentences"
      />

      <QuickFillChips
        label="Or pick one"
        options={PREFERRED_TIMES}
        value={preferredTime}
        onSelect={setPreferredTime}
        disabled={saving}
        testGroup="time"
      />

      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        hint="Anything you want to remember to ask."
        multiline
        autoCapitalize="sentences"
      />

      {error && <ErrorNotice message={error} onRetry={() => void submit()} />}

      <AppButton
        label="Save this appointment"
        onPress={() => void submit()}
        loading={saving}
        // Not before we know whose visit this is — see ProfileBanner.
        disabled={saving || !ready}
        accessibilityHint="Saves the appointment in MedHelp. Nothing is sent to the provider."
      />
      <AppButton
        label="Cancel"
        variant="secondary"
        onPress={() => navigation.goBack()}
        disabled={saving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  provider: {
    gap: spacing.xs,
  },
  providerLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  providerName: {
    ...typography.title,
    color: colors.textPrimary,
  },
  providerMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  notice: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noticeHeading: {
    ...typography.bodyStrong,
    color: colors.noticeText,
  },
  noticeBody: {
    ...typography.caption,
    color: colors.noticeText,
  },
  context: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  contextHeading: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  contextBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
