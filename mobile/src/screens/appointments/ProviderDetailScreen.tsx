import { Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "ProviderDetail">;

function formatDistance(miles: number | null): string | null {
  if (miles === null) return null;
  return miles < 10 ? `~${miles.toFixed(1)} mi away` : `~${Math.round(miles)} mi away`;
}

export function ProviderDetailScreen({ navigation, route }: Props) {
  const { provider, intake } = route.params;
  const distance = formatDistance(provider.distanceMiles);

  return (
    <Screen wide domain="care">
      <PageHeader title={provider.name} subtitle={provider.specialty ?? undefined} />

      <View style={styles.card}>
        {provider.address && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Address</Text>
            <Text style={styles.fieldValue}>{provider.address}</Text>
            {distance && <Text style={styles.fieldNote}>{distance}</Text>}
          </View>
        )}
        {provider.phone && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <Text style={styles.fieldValue}>{provider.phone}</Text>
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>NPI</Text>
          <Text style={styles.fieldValue}>{provider.npi}</Text>
        </View>
      </View>

      {/*
        The honest availability panel.

        This is the screen where a booking product would list "9:00, 9:20,
        9:40". MedHelp has no source for those times: the directory publishes
        none, and no scheduling partner is connected. Rendering plausible slots
        would be inventing them, and someone would turn up at a clinic for an
        appointment that does not exist.

        So the screen says what it knows and what it does not. It is driven off
        nothing — there is no flag to get wrong here, because there is no code
        path in this app that can produce a slot.
      */}
      <View style={styles.availability}>
        <Text style={styles.availabilityHeading}>Available times</Text>
        <Text style={styles.availabilityBody}>
          MedHelp can't see this provider's calendar, so it can't show
          appointment times or book one for you. No app can, unless the
          provider has connected their scheduling system to it — and none has
          here.
        </Text>
        <Text style={styles.availabilityBody}>
          What you can do is record the visit you want below. MedHelp keeps the
          details together and reminds you what you were going to ask about;
          you then call the provider to fix a time.
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Request this appointment"
          onPress={() =>
            navigation.navigate("AppointmentRequest", { provider, intake })
          }
          accessibilityHint="Opens a form to record the visit you want. Nothing is sent to the provider."
        />
        {provider.phone && (
          /*
            The call button is the one thing on this screen that actually
            reaches the clinic, so it is a real action rather than a printed
            number. It dials — it does not hand the user off to a maps app, a
            booking site, or an ad.
          */
          <AppButton
            label={`Call ${provider.phone}`}
            variant="secondary"
            onPress={() => {
              Linking.openURL(
                `tel:${provider.phone?.replace(/[^\d+]/g, "") ?? ""}`
              ).catch(() => {
                // Nothing to recover: the number is displayed above and can
                // be dialled by hand.
              });
            }}
            accessibilityHint="Calls the provider to arrange a time"
          />
        )}
      </View>

      {/*
        ⛔ A HAND-OFF, AND THE COPY HAS TO KEEP SAYING SO.

        MedHelp cannot book an appointment — that needs a partnership, provider
        opt-in and a BAA, none of which exist. This is the address of somebody
        else's booking page. The heading names the destination, the body says
        the booking happens on their site, and the button says "open", never
        "book". If this ever reads as MedHelp booking something, it is wrong.

        Nothing about the user is attached to the link: no ZIP, no reason for
        visit, no tier. That is why opening it transmits nothing and needs no
        BAA, and it is a property of the server's registry, asserted there.

        It sits BELOW the call button on purpose. Calling is the path that
        always works; this one depends on the clinic's own site being up and
        offering what the person needs, and a broken promise at the top of the
        screen is worse than a working one underneath.
      */}
      {provider.schedulingUrl && provider.schedulingSystem && (
        <View style={styles.online}>
          <Text style={styles.onlineHeading}>
            {provider.schedulingKind === "directory"
              ? "They may take bookings online"
              : `Book online at ${provider.schedulingSystem}`}
          </Text>
          <Text style={styles.onlineBody}>
            {provider.schedulingKind === "directory"
              ? `MedHelp does not know this provider's booking page. ${provider.schedulingSystem} keeps a directory you can search for them by name — the booking, if they offer one, happens on their site and not in MedHelp.`
              : `This opens ${provider.schedulingSystem}'s own booking page in your browser. You book with them there — MedHelp is not involved and will not know the result, so add the time here yourself afterwards.`}
          </Text>
          <AppButton
            label={
              provider.schedulingKind === "directory"
                ? `Search ${provider.schedulingSystem}`
                : `Open ${provider.schedulingSystem}`
            }
            variant="secondary"
            onPress={() => {
              // Already checked to be https when it was parsed; a failure here
              // is a browser that would not open, and the screen is unchanged.
              Linking.openURL(provider.schedulingUrl as string).catch(() => {});
            }}
            accessibilityHint={`Opens ${provider.schedulingSystem} in your browser. MedHelp does not book the appointment.`}
          />
        </View>
      )}

      <Text style={styles.sourceNote}>
        Listing from the {provider.sourceName}. MedHelp does not rank or
        recommend providers. Please confirm with the provider that they are
        accepting patients and that your insurance is accepted.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  /*
    ⛔ A neutral surface, never a safety family. This is a convenience about a
    clinic's website; the emergency, error and notice palettes carry a reviewed
    meaning about urgency that it has not earned.
  */
  online: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  onlineHeading: { ...typography.bodyStrong, color: colors.textPrimary },
  onlineBody: { ...typography.caption, color: colors.textSecondary },
  fieldLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  fieldNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  availability: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    // The rail marks this as the same kind of "read this" block as the care
    // guidance and escalation panels elsewhere in the app.
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  availabilityHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  availabilityBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.md,
  },
  sourceNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
