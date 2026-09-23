import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { Glyph } from "@/components/Glyph";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { AppNav } from "@/components/AppNav";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SymptomPicker } from "@/components/SymptomPicker";
import { TextField } from "@/components/TextField";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { ProfileBanner } from "@/components/ProfileBanner";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { clearCheckIn, getCheckIn, type CheckIn } from "@/services/checkIns";
import { IntakeError, PAST_TIER_LABELS, submitIntake } from "@/services/intakeService";
import { rearm } from "@/services/reminderArming";
import { composeDescription, labelsFor } from "@/services/symptomVocabulary";
import {
  BORDER_WIDTH,
  EDGE_WIDTH,
  MIN_TAP_TARGET,
  colors,
  domains,
  fonts,
  radius,
  spacing,
  typography,
} from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomIntake">;

export function SymptomIntakeScreen({ navigation, route }: Props) {
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkIn, setCheckInState] = useState<CheckIn | null>(null);
  const { active, profiles, profileId } = useActiveProfile();

  const reset = route.params?.reset;
  const checkingIn = route.params?.checkIn;

  /*
    Answering a check-in: yesterday's words go back in the box, editable, and
    the earlier estimate is stated above it as a fact. Nothing is added to the
    person's text — a "Now:" prefix would be MedHelp's words sent to triage
    and saved as theirs. The earlier tier never reaches the server.
  */
  useEffect(() => {
    if (!checkingIn) return;
    navigation.setParams({ checkIn: undefined });
    void getCheckIn().then((pending) => {
      if (!pending) return;
      setCheckInState(pending);
      setDescription(pending.description ? `${pending.description}\n` : "");
      setSelectedSymptoms([]);
      setConsent(false);
    });
  }, [checkingIn, navigation]);

  /*
    Start "Describe something else" from empty.

    That button navigates BACK to this screen rather than opening a new one —
    it is already in the stack, underneath the result — so the component never
    unmounts and its state survives. Someone describing a second complaint was
    landing on the first one's text and having to clear it by hand.

    CONSENT IS RESET TOO, and that part is not cosmetic. It was ticked for a
    particular description; carrying it silently onto the next one would store
    a second piece of health data under permission given for something else.
    A new description asks again.

    The param is cleared as it is consumed, so returning here later — from the
    follow-up questions, say — does not wipe text the user is still editing.
  */
  useEffect(() => {
    if (!reset) return;

    setDescription("");
    setDescriptionError(null);
    // The picked symptoms go with the description they were picked for.
    // Carrying them onto a second complaint would silently attach the first
    // complaint's symptoms to it.
    setSelectedSymptoms([]);
    setConsent(false);
    setError(null);
    setIsOffline(false);
    navigation.setParams({ reset: undefined });
  }, [reset, navigation]);

  const speech = useSpeechToText((transcript) => {
    // Appended rather than replacing, so dictation can add to typed text.
    setDescription((current) => (current ? `${current} ${transcript}` : transcript));
  });

  const handleSubmit = async () => {
    if (submitting) return;

    const trimmed = description.trim();
    const picked = labelsFor(selectedSymptoms);

    /*
      ⛔ TYPING IS OPTIONAL. EITHER INPUT IS ENOUGH; NEITHER IS NOT.

      This used to require typed prose, on the reasoning that "a picked symptom
      is not a substitute for a description" — the list was built as an aid to
      someone already writing. The repository owner asked on 2026-09-17 for the
      opposite: that a person be able to answer entirely by tapping, "so you can
      only use that if you want to". CLAUDE.md records that reversal and the
      reasoning on both sides.

      What the old comment got right, and what had to be handled rather than
      waved away: the follow-up questions are written to elicit prose, so a
      tap-only submission that the rules do not recognise lands on a
      questionnaire asking where it is and how long it has been going on. That
      still works — those questions are answerable by someone who never typed
      anything, and two of the four are already multiple choice — but it is the
      reason this is a reversal with a consequence rather than a free one.

      What is NOT relaxed: something has to be said. An empty submission would
      be asking the classifier to estimate urgency from nothing at all, and the
      safe default would hand back URGENT with no basis whatsoever.
    */
    if (!trimmed && picked.length === 0) {
      setDescriptionError(
        "Tell us what's going on — type a description, or pick from the list below. Either is enough."
      );
      return;
    }

    /*
      What the server will actually assess: the typed text and the picked
      phrases joined the way `merge_selected_symptoms` joins them.

      The server composes this itself and is authoritative. This copy exists
      because the screens downstream need a description to carry — and when
      somebody typed nothing, the picked phrases are the only description
      there is. Passing `trimmed` here would hand the appointment flow an empty
      reason for visit and the follow-up screen an empty complaint.
    */
    const composed = composeDescription(trimmed, selectedSymptoms);

    setDescriptionError(null);
    setError(null);
    setIsOffline(false);
    setSubmitting(true);

    try {
      // ⛔ Whose history this is saved under. Never waited for: if the profile
      // has not loaded yet, a saved row may be filed under "Me", which is
      // recoverable; delaying emergency screening is not.
      const whose = checkIn ? checkIn.profileId ?? null : profileId;
      const result = await submitIntake(trimmed, consent, undefined, picked, whose);
      if (checkIn) {
        // Answered. Cleared only once the server has the new description, so
        // a failed submission leaves the check-in waiting on Today.
        setCheckInState(null);
        void clearCheckIn().then(() => rearm());
      }
      if (result.status === "needs_detail") {
        // The server could not make sense of this and is asking rather than
        // guessing. A red-flag description never lands here — it comes back
        // as an assessment with its emergency guidance already attached.
        navigation.navigate("IntakeFollowUp", {
          followUp: result,
          description: composed,
          consent,
          profileId: whose,
        });
      } else {
        navigation.navigate("IntakeResult", {
          assessment: result,
          // Carried so the appointment flow can prefill the reason for visit.
          description: composed,
        });
      }
    } catch (caught) {
      if (caught instanceof IntakeError) {
        setError(caught.message);
        setIsOffline(caught.isNetworkError);
      } else {
        setError(
          "We couldn't assess this. Please contact a healthcare professional if you feel unwell, and call 911 if this may be an emergency."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppNav current="Symptoms" navigation={navigation}>
    <Screen>
      {/* Reachable before, during, and after assessment — never conditional. */}
      <EmergencyCallBar />

      <PageHeader
        icon="symptom"
        title="What's going on?"
        /*
          ⛔ THIS SAYS BOTH WAYS IN, AND IT HAS TO.

          It used to read "Describe how you're feeling in your own words",
          which was the only way in when it was written. Typing is optional
          now, and a screen that opens by telling someone to describe things in
          their own words has already turned away the person who came here
          because they did not want to write anything.
        */
        subtitle="Type it in your own words, tap it from a list, or do both. Include when it started and anything that's changed."
      />

      {/*
        Shown before the user submits anything, not after. Required by the
        feature's safety rules — do not move this below the input or hide it
        behind a tap.
      */}
      <View style={styles.disclaimer} accessible accessibilityRole="summary">
        <Text style={styles.disclaimerHeading}>This estimates urgency. It does not diagnose.</Text>
        <Text style={styles.disclaimerBody}>
          MedHelp can suggest how soon you may need to be seen. It cannot tell
          you what is wrong, and it is not a substitute for a clinician. If you
          are in doubt, seek care directly — you never need this app's
          agreement to do that.
        </Text>
      </View>

      {error && (
        <ErrorNotice message={error} onRetry={isOffline ? handleSubmit : undefined} />
      )}

      {!checkIn && (
        <ProfileBanner
          active={active}
          profiles={profiles}
          onChange={() => navigation.navigate("CareProfiles")}
        />
      )}

      {checkIn && (
        <View style={styles.checkIn} accessibilityRole="summary">
          <Text style={styles.checkInText}>
            Checking in{checkIn.profileName ? ` on ${checkIn.profileName}` : ""} — what you described on{" "}
            {new Date(checkIn.createdAt).toLocaleDateString(undefined, { weekday: "long" })}.
            Earlier estimate: {PAST_TIER_LABELS[checkIn.earlierTier]}. Add how things are now.
          </Text>
        </View>
      )}

      <TextField
        // Says optional, because it is. A required-looking field is the thing
        // that stops somebody scrolling to the list underneath it.
        label="Describe your symptoms (optional)"
        placeholder="e.g. I've had a headache for two days and light hurts my eyes"
        value={description}
        onChangeText={setDescription}
        error={descriptionError}
        /*
          ⛔ THIS SENTENCE CHANGED WHEN THE SYMPTOM LIST WAS ADDED, AND THE OLD
          ONE MUST NOT COME BACK.

          It used to read "Your own words. Nothing here is rewritten before it
          is assessed." That was true of a screen where the only input was
          prose the user typed. It stopped being true the moment MedHelp began
          offering phrases of its own to add.

          What is still true, and what this says instead: the text the person
          types is never altered, and anything the app contributed is visible
          as a separate chip they can remove. Do not restore a claim that the
          app adds nothing — it does now.
        */
        hint="Your own words — what you type is never rewritten. Anything you add from the list below is shown separately, and you can remove it."
        multiline
        autoCapitalize="sentences"
        editable={!submitting}
      />

      {/*
        The list sits under the field rather than over it: it reacts to what
        has been typed, and a panel that opened on top of the input would
        cover the words it is reacting to. It renders nothing until there is
        something to offer, so an empty screen stays empty.
      */}
      <SymptomPicker
        description={description}
        selectedIds={selectedSymptoms}
        onChange={setSelectedSymptoms}
        disabled={submitting}
      />

      <View style={styles.dictationRow}>
        {/*
          A round mic rather than a text button. It is the one icon-only
          control in the app, which a microphone can carry because it is about
          as universally recognised as a glyph gets — and it still names
          itself to a screen reader, and still says in that name whether it is
          currently listening.
        */}
        <Pressable
          onPress={speech.listening ? speech.stop : speech.start}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={
            speech.listening ? "Stop dictating" : "Dictate instead"
          }
          accessibilityHint="Uses your device's speech recognition to fill in the description"
          style={({ pressed }) => [
            styles.dictationButton,
            (pressed || speech.listening) && styles.dictationButtonActive,
            submitting && styles.dictationButtonDisabled,
          ]}
        >
          <Glyph name="mic" size={26} color={colors.textOnAccent} />
        </Pressable>
        <Text style={styles.dictationLabel}>
          {speech.listening ? "Listening — tap to stop" : "Or dictate it"}
        </Text>
        {!speech.supported && (
          <Text style={styles.dictationNote}>
            Dictation isn't available on this device yet — typing works fine.
          </Text>
        )}
        {speech.error && <Text style={styles.dictationError}>{speech.error}</Text>}
      </View>

      <Pressable
        onPress={() => setConsent((value) => !value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        /*
          ⛔ THE STATE IS IN THE LABEL, AND ON THIS CONTROL IT MATTERS MOST.

          React Native Web 0.19.13 never reads `accessibilityState` — it takes
          `aria-checked` instead — so this box rendered with no state at all.
          A reader could not tell whether they had agreed to their own symptom
          description being stored, which is the one thing a consent control
          exists to make unambiguous. It stays because it is right on native.

          This changes no disclaimer and no escalation copy. It is still text
          on the intake screen, so it belongs in the clinical reviewer's read
          of that screen, the same as the URGENT hand-off.
        */
        accessibilityLabel={
          "Save this description so it can be reviewed for accuracy, " +
          (consent ? "ticked" : "not ticked")
        }
        style={styles.consentRow}
        disabled={submitting}
      >
        <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
          {consent && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        {/*
          2026-09-22: the second sentence is new. Saving now also puts the
          description under Past descriptions, and consent has to say what it
          is consent to. Belongs in the reviewer's read of this screen.
        */}
        <Text style={styles.consentText}>
          Save this description and the result so MedHelp can review how
          accurate these estimates are. Optional — the estimate works either
          way. Saved ones also appear under Past descriptions, where you can
          remove them.
        </Text>
      </Pressable>

      <AppButton
        label={submitting ? "Checking…" : "Get an urgency estimate"}
        onPress={handleSubmit}
        loading={submitting}
      />

      <AppButton
        label="Past descriptions"
        variant="secondary"
        accessibilityHint="The descriptions you chose to save, and a summary to share with a clinician"
        onPress={() => navigation.navigate("SymptomHistory")}
      />
    </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  checkIn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  checkInText: { ...typography.body, color: colors.textPrimary },
  disclaimer: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  disclaimerHeading: { ...typography.bodyStrong, color: colors.noticeText },
  disclaimerBody: { ...typography.caption, color: colors.noticeText },
  dictationRow: { gap: spacing.sm, alignItems: "center" },
  /*
    ⛔ Filled in the destination's hue, which makes two filled controls on
    this screen — this and "Get an urgency estimate". It is allowed because
    the two are not competing for the same press: this one is an input method
    for the field above it, and the other ends the task. If a third filled
    control ever appears here, one of them is wrong.
  */
  dictationButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: domains.symptoms.fill,
    borderBottomWidth: EDGE_WIDTH,
    borderBottomColor: domains.symptoms.edge,
  },
  dictationButtonActive: {
    backgroundColor: domains.symptoms.pressed,
    borderBottomColor: domains.symptoms.pressed,
    borderBottomWidth: BORDER_WIDTH,
    marginTop: EDGE_WIDTH - BORDER_WIDTH,
  },
  dictationButtonDisabled: {
    backgroundColor: colors.accentDisabled,
    borderBottomColor: colors.accentDisabled,
  },
  dictationLabel: { ...typography.captionStrong, color: colors.textSecondary },
  dictationNote: { ...typography.caption, color: colors.textSecondary },
  dictationError: { ...typography.caption, color: colors.errorText },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: MIN_TAP_TARGET,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: { color: colors.textOnAccent, fontSize: 16, fontFamily: fonts.sansBold },
  consentText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
});
