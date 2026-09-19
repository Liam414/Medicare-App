import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import {
  ApiError,
  getBookingCapability,
  updateAppointment,
} from "@/services/appointmentService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AppointmentConfirmation">;

/**
 * What was saved, and — the part that matters — what still has to happen.
 *
 * The word "confirmed" appears nowhere on this screen, and neither does a
 * green tick standing on its own. Nothing has been confirmed: a row exists in
 * MedHelp and the clinic has never heard of it. The visual weight here goes on
 * the call-the-clinic step rather than on congratulating the user for
 * finishing a form.
 */
export function AppointmentConfirmationScreen({ navigation, route }: Props) {
  const { appointment } = route.params;

  // Defensive: the server sets this false on every row it can currently
  // produce. If a future booking channel ever makes it true, this screen
  // changes its story rather than continuing to under-promise.
  const notified = appointment.providerNotified;

  // Asked, never assumed. Defaults to false, so a failed or slow check shows
  // the call-the-clinic path rather than an identity form that would fail.
  const [canBook, setCanBook] = useState(false);

  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const markScheduled = async () => {
    if (marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      await updateAppointment(appointment.id, {
        status: "SCHEDULED",
        // ⛔ Carried unchanged rather than defaulted away. `updateAppointment`
        // sends null for anything omitted, so leaving these out would silently
        // erase the reason and the note the user typed one screen ago.
        preferredTime: appointment.preferredTime,
        notes: appointment.notes,
      });
      setMarked(true);
    } catch (caught) {
      setMarkError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't update this appointment. Try again, or change it in your appointments list."
      );
    } finally {
      setMarking(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const available = await getBookingCapability();
        if (active) setCanBook(available);
      } catch {
        // Staying false is the safe outcome; nothing to tell the user.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen wide domain="care">
      <View style={notified ? styles.savedBooked : styles.saved}>
        <Text style={notified ? styles.savedHeadingBooked : styles.savedHeading}>
          {notified ? "Appointment booked" : "Saved to your appointments"}
        </Text>
        <Text style={notified ? styles.savedBodyBooked : styles.savedBody}>
          {notified
            ? `${appointment.providerName} has received your request.`
            : `MedHelp has kept these details for you. ${appointment.providerName} has not been contacted — you still need to call to arrange a time.`}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Provider</Text>
          <Text style={styles.fieldValue}>{appointment.providerName}</Text>
          {appointment.providerAddress && (
            <Text style={styles.fieldNote}>{appointment.providerAddress}</Text>
          )}
        </View>

        {appointment.reasonForVisit && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Reason for visit</Text>
            <Text style={styles.fieldValue}>{appointment.reasonForVisit}</Text>
          </View>
        )}

        {appointment.preferredTime && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Preferred time</Text>
            <Text style={styles.fieldValue}>{appointment.preferredTime}</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Status</Text>
          <Text style={styles.fieldValue}>
            {appointment.status === "REQUESTED"
              ? "Requested — not yet arranged with the provider"
              : appointment.status}
          </Text>
        </View>
      </View>

      {/*
        The booking path's entry point, gated on the server's own answer.

        `canBook` is false today and this never renders, which is the point:
        the identity form behind it asks for a legal name, date of birth and
        home address, and there is currently nowhere to send them. Collecting
        that for no purpose would be worse than not having the screen.

        When a BAA-covered channel exists, `/appointments/capabilities` starts
        saying so and this appears — no component needs editing.
      */}
      {!notified && canBook && (
        <View style={styles.nextStep}>
          <Text style={styles.nextStepHeading}>Next step</Text>
          <Text style={styles.nextStepBody}>
            Send this request to {appointment.providerName}. They'll need a few
            details to identify you — MedHelp doesn't keep them.
          </Text>
          <AppButton
            label="Send request to provider"
            onPress={() =>
              navigation.navigate("BookingIdentity", {
                // An id, never the identity itself.
                appointmentId: appointment.id,
                providerName: appointment.providerName,
              })
            }
          />
        </View>
      )}

      {!notified && !canBook && appointment.providerPhone && (
        <View style={styles.nextStep}>
          <Text style={styles.nextStepHeading}>Next step</Text>
          <Text style={styles.nextStepBody}>
            Call {appointment.providerName} to arrange the time. Everything you
            need to tell them is below — keep this screen open while you call.
          </Text>

          {/*
            ⛔ A CHECKLIST FOR A PHONE CALL, NOT ADVICE.

            Every line here is either something the user already wrote down on
            the previous screen, or an administrative question about the
            appointment — what to bring, whether the clinic takes their
            insurance. Nothing on this card says anything about their health,
            suggests a question to ask about their condition, or interprets
            what they typed.

            That line matters because this is the screen somebody reads while a
            receptionist is on the line, which is the worst possible moment to
            put a clinical suggestion in front of them. If a line here is ever
            tempted toward "ask whether it could be X", it belongs in the
            clinical review that intake is still waiting for, not on this card.
          */}
          <View style={styles.script}>
            <Text style={styles.scriptHeading}>What to tell them</Text>

            <View style={styles.scriptRow}>
              <Text style={styles.scriptLabel}>You want</Text>
              <Text style={styles.scriptValue}>
                {appointment.reasonForVisit
                  ? `An appointment about: ${appointment.reasonForVisit}`
                  : "An appointment"}
              </Text>
            </View>

            {appointment.preferredTime && (
              <View style={styles.scriptRow}>
                <Text style={styles.scriptLabel}>When suits you</Text>
                <Text style={styles.scriptValue}>{appointment.preferredTime}</Text>
              </View>
            )}

            <View style={styles.scriptRow}>
              <Text style={styles.scriptLabel}>Worth asking</Text>
              <Text style={styles.scriptValue}>
                What is the soonest they can see you, what to bring, and whether
                they take your insurance.
              </Text>
            </View>
          </View>

          <AppButton
            label={`Call ${appointment.providerPhone}`}
            onPress={() => {
              Linking.openURL(
                `tel:${appointment.providerPhone?.replace(/[^\d+]/g, "") ?? ""}`
              ).catch(() => {});
            }}
            accessibilityHint="Calls the provider to arrange a time"
          />

          {/*
            Closing the loop in one tap.

            Before this, arranging a time meant leaving here, opening the
            appointments list, finding the row and changing its status — four
            navigations after a phone call the person has just finished. The
            moment they know they have an appointment is the moment to record
            it, and it is one press.

            ⛔ IT RECORDS THAT A TIME WAS AGREED, NEVER WHAT THE TIME IS.
            `appointments` has no scheduled datetime and must not gain one —
            CLAUDE.md fences that, because a time MedHelp invents is a time
            somebody turns up for. The status says an arrangement exists; the
            user's own note is where the time itself lives.
          */}
          {marked ? (
            <Text style={styles.markedNote} accessibilityLiveRegion="polite">
              Marked as scheduled. Add the time they gave you in your
              appointments list.
            </Text>
          ) : (
            <AppButton
              label="I've arranged a time"
              variant="secondary"
              onPress={() => void markScheduled()}
              loading={marking}
              disabled={marking}
              accessibilityHint="Marks this appointment as scheduled. Nothing is sent to the provider."
            />
          )}

          {markError && <ErrorNotice message={markError} onRetry={() => void markScheduled()} />}
        </View>
      )}

      <AppButton
        label="View my appointments"
        variant="secondary"
        onPress={() => navigation.replace("AppointmentList")}
      />
      <AppButton
        label="Back to home"
        variant="secondary"
        onPress={() => navigation.navigate("Home")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  saved: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  savedHeading: {
    ...typography.title,
    color: colors.noticeText,
  },
  savedBody: {
    ...typography.body,
    color: colors.noticeText,
  },
  savedBooked: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  savedHeadingBooked: {
    ...typography.title,
    color: colors.successText,
  },
  savedBodyBooked: {
    ...typography.body,
    color: colors.successText,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...elevation.sm,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  fieldNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nextStep: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nextStepHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  nextStepBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  /*
    The call card. ⛔ Neutral surface, never a safety family — this is a
    checklist for a phone call and asserts nothing about urgency. The emergency
    and notice palettes carry a reviewed meaning it has not earned.
  */
  script: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.md,
  },
  scriptHeading: { ...typography.bodyStrong, color: colors.textPrimary },
  scriptRow: { gap: 2 },
  scriptLabel: { ...typography.overline, color: colors.textSecondary },
  scriptValue: { ...typography.body, color: colors.textPrimary },
  markedNote: { ...typography.caption, color: colors.textSecondary },
});
