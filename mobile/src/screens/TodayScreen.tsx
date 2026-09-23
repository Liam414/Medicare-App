import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Glyph, GlyphTile } from "@/components/Glyph";
import { InfoPanel } from "@/components/InfoPanel";
import { Screen } from "@/components/Screen";
import { Mark, Wordmark } from "@/components/Mark";
import { DomainProvider } from "@/hooks/useDomain";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { logout } from "@/services/authService";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { clearCheckIn, getCheckIn, isDue, type CheckIn } from "@/services/checkIns";
import { ProfileBanner } from "@/components/ProfileBanner";
import { useActiveProfile } from "@/hooks/useActiveProfile";
import { SegmentedControl } from "@/components/SegmentedControl";
import { LANGUAGES, SPANISH_UI_ENABLED, type Language } from "@/i18n/strings";
import { useLanguage } from "@/i18n/useLanguage";
import { setActiveProfile } from "@/services/profileService";
import { rearm } from "@/services/reminderArming";
import { listMedications, type Medication } from "@/services/medicationService";
import { listSchedules, type MedicationSchedule } from "@/services/reminderService";
import { dueState, formatTimeOfDay, sortByTime } from "@/services/reminderTiming";
import {
  BORDER_WIDTH,
  MIN_TAP_TARGET,
  TILE,
  colors,
  domains,
  elevation,
  radius,
  spacing,
  typography,
} from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

/**
 * The screen a signed-in user lands on.
 *
 * ## Why this is not the old hub
 *
 * Home used to be a menu of four cards, so it answered "what can this app do?"
 * on every visit. That is the right answer on the first run and the wrong one
 * on the fiftieth, by which point the question is "what is happening today?".
 * The four destinations now live in `AppNav`, which is on screen everywhere,
 * and this screen spends its space on the user's own records instead.
 *
 * ## ⛔ What may go on it
 *
 * Only three kinds of thing, and all three are the user's own data read back
 * to them:
 *
 * - reminder times **they** set,
 * - appointments **they** recorded,
 * - refill dates **they** entered.
 *
 * Nothing here may be a number about their health. MedHelp does not know
 * whether a dose was taken, so there is no "3 of 4 taken", no streak, no
 * adherence score — a time that has gone by reads "Earlier today", never
 * "missed". This is the same fence as the note at the top of `InfoPanel`, and
 * it is the reason the panels beside this content talk about the software
 * rather than about the person using it.
 *
 * ## What is deliberately absent
 *
 * A route to emergency services. `EmergencyCallBar` is escalation copy, and
 * CLAUDE.md fences *which screens show it* behind human approval obtained
 * outside the agent pipeline. Putting it here is proposed and not approved, so
 * it is not here. Do not add it on an agent's authority.
 */
export function TodayScreen({ navigation }: Props) {
  const { isExpanded } = useBreakpoint();

  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [schedules, setSchedules] = useState<MedicationSchedule[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const { active, profiles, ready, profileId } = useActiveProfile();
  const { language, setLanguage, t } = useLanguage();

  /**
   * The three lists are independent, so one failing must not blank the other
   * two. `allSettled` keeps whatever arrived and says so once at the top,
   * rather than replacing someone's medication times with an error because
   * their appointment list timed out.
   */
  const load = useCallback(async () => {
    setLoading(true);
    const [medicationResult, scheduleResult, appointmentResult] =
      await Promise.allSettled([
        listMedications(undefined, profileId),
        listSchedules(),
        listAppointments(profileId),
      ]);

    if (medicationResult.status === "fulfilled") setMedications(medicationResult.value);
    if (scheduleResult.status === "fulfilled") setSchedules(scheduleResult.value);
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value);

    const failed = [medicationResult, scheduleResult, appointmentResult].filter(
      (result) => result.status === "rejected"
    ).length;

    setError(
      failed === 0
        ? null
        : failed === 3
          ? "We couldn't load anything just now. Check your connection and try again."
          : "Some of today couldn't be loaded. What's shown below is up to date."
    );
    setLoading(false);
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void load();
      setNow(new Date());
      // On the device, so it shows with no network — the notification is the
      // bonus and this card is the part that is always correct.
      void getCheckIn().then(setCheckIn).catch(() => setCheckIn(null));
    }, [ready, load])
  );

  // Keeps "Due now" and "Earlier today" honest without a re-render storm.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleSignOut = () => {
    // ⛔ A pending check-in holds symptom text. On a shared computer the next
    // person to sign in would otherwise find it prefilled. Cleared here, on an
    // explicit sign-out only — a 401 must not clear it, because a check-in is
    // due a day later and the session will long since have expired.
    void clearCheckIn();
    // Whose records were on screen is not something the next person to sign
    // in on this device should inherit.
    void setActiveProfile(null);
    void logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const times = sortByTime(
    (schedules ?? []).flatMap((schedule) =>
      schedule.reminders
        .filter((reminder) => reminder.enabled)
        .map((reminder) => ({
          key: reminder.id,
          timeOfDay: reminder.timeOfDay,
          // Everyone's times, because a caregiver's day includes Dad's doses —
          // each one saying whose it is.
          name: schedule.profileName
            ? `${schedule.profileName}: ${schedule.medicationName}`
            : schedule.medicationName,
          dosage: schedule.dosage,
        }))
    )
  );

  const needingRefill = (medications ?? []).filter(
    (medication) => medication.refillOverdue || medication.refillDueSoon
  );

  // Requested first: those are the ones where nobody has been contacted yet
  // and the user still has a phone call to make. Nothing here sorts by date —
  // `preferredTime` is free text, so any ordering by "soonest" would be made
  // up. See the appointment rules in CLAUDE.md.
  const openVisits = (appointments ?? [])
    .filter((appointment) => appointment.status === "REQUESTED" || appointment.status === "SCHEDULED")
    .sort((a, b) => Number(b.status === "REQUESTED") - Number(a.status === "REQUESTED"))
    .slice(0, 2);

  /**
   * The day's reminder times as rows.
   *
   * ⛔ `standing` is the row's own words and is the only place a past time is
   * described. "Earlier today", never "missed" — MedHelp does not know
   * whether the dose was taken, and the row's tint says nothing the row does
   * not also say in words.
   */
  const shown = times.slice(0, 5);
  const doseRows = shown.map((time) => {
    const state = dueState(time.timeOfDay, now);
    return {
      key: time.key,
      time: formatTimeOfDay(time.timeOfDay, now),
      name: time.name,
      dosage: time.dosage ?? undefined,
      standing:
        state === "due"
          ? "Due now"
          : state === "passed"
            ? "Earlier today"
            : "Later today",
      due: state === "due",
    };
  });

  /**
   * The greeting panel: the filled block the screen opens on.
   *
   * ⛔ The one figure on it is **how many reminder times the person set for
   * today**. That is arithmetic on their own entries, like the refill count
   * below it — not a reading of their health, and above all not a count of
   * doses taken, which MedHelp has no way to know. Nothing else may be added
   * here; see the fence at the top of this file.
   */
  const greeting = (
    <View style={styles.greeting}>
      <View style={styles.greetingRow}>
        <Text style={styles.greetingTitle} accessibilityRole="header">
          {t("today.greeting")}
        </Text>
        {/*
          The reference design puts a user avatar here. MedHelp holds no name,
          photograph or initial for anybody, so this is the app's own mark
          rather than an invented identity.
        */}
        <View style={styles.avatar}>
          <Mark size={18} color={colors.textOnAccent} gutter={colors.accent} />
        </View>
      </View>
      <Text style={styles.greetingDate}>
        {now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </Text>
      {times.length > 0 ? (
        <View style={styles.greetingChip}>
          <Text style={styles.greetingChipText}>
            {times.length === 1
              ? "1 medication time today"
              : `${times.length} medication times today`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const symptomAction = (
    // The card is a door into Symptoms, so it wears the Symptoms hue rather
    // than Today's — the same colour the tab, the screen and its one button
    // will be once the user is through it.
    <DomainProvider domain="symptoms">
      <View style={[styles.hero, isExpanded && styles.heroExpanded]}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t("today.heroTitle")}
          </Text>
          <Text style={styles.heroBody}>{t("today.heroBody")}</Text>
        </View>
        <AppButton
          label={t("today.heroButton")}
          variant="outline"
          onPress={() => navigation.navigate("SymptomIntake")}
          accessibilityHint="Opens a form to describe what is wrong"
          style={styles.heroButton}
        />
      </View>
      {checkIn && (
        <View style={styles.quietCard}>
          <Text style={styles.quietTitle}>
            {isDue(checkIn, now)
              ? "Time to check in"
              : `Check-in set for ${new Date(checkIn.dueAt).toLocaleString(undefined, {
                  weekday: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
          </Text>
          <Text style={styles.quietText}>
            How are things now compared with when you last described them?
          </Text>
          <AppButton
            label={isDue(checkIn, now) ? "Check in now" : "Check in early"}
            variant="secondary"
            onPress={() => navigation.navigate("SymptomIntake", { checkIn: true })}
            accessibilityHint="Opens the symptom form with what you wrote last time"
          />
          <AppButton
            label="Cancel check-in"
            variant="secondary"
            onPress={() => {
              setCheckIn(null);
              void clearCheckIn().then(() => rearm());
            }}
          />
        </View>
      )}
    </DomainProvider>
  );

  const medicationTimes = (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {t("today.medicationTimes")}
        </Text>
        <Pressable
          onPress={() => navigation.navigate("MedicationReminders")}
          accessibilityRole="button"
          accessibilityLabel="Edit reminder times"
          style={styles.sectionAction}
        >
          <Text style={styles.sectionActionText}>Edit</Text>
        </Pressable>
      </View>

      {times.length === 0 ? (
        <View style={styles.quietCard}>
          <Text style={styles.quietTitle}>No reminder times set</Text>
          <Text style={styles.quietText}>
            MedHelp can suggest times from a medication's printed directions.
            You confirm them before anything is saved.
          </Text>
        </View>
      ) : (
        <>
          {doseRows.map((row) => (
            <Pressable
              key={row.key}
              onPress={() => navigation.navigate("MedicationReminders")}
              accessibilityRole="button"
              accessibilityLabel={row.name}
              accessibilityHint={[row.time, row.standing, row.dosage]
                .filter(Boolean)
                .join(". ")}
              style={({ pressed }) => [
                styles.doseRow,
                row.due && styles.doseRowDue,
                pressed && styles.doseRowPressed,
              ]}
            >
              <GlyphTile
                name="pill"
                label="Rx"
                size={TILE.md}
                tint={row.due ? colors.noticeSurface : domains.medications.surface}
                color={row.due ? colors.noticeText : domains.medications.ink}
              />
              <View style={styles.doseBody}>
                <Text style={styles.doseName}>{row.name}</Text>
                {/*
                  ⛔ "Earlier today", never "missed". The tint on a due row is
                  a second route to the same words, never a replacement for
                  them — MedHelp does not know whether the dose was taken.
                */}
                <Text style={[styles.doseStanding, row.due && styles.doseStandingDue]}>
                  {row.due ? row.standing : `${row.standing}, ${row.time}`}
                </Text>
              </View>
              <Glyph name="chevron" size={16} color={colors.borderStrong} />
            </Pressable>
          ))}

          {times.length > 5 ? (
            <Pressable
              onPress={() => navigation.navigate("MedicationReminders")}
              accessibilityRole="button"
              style={styles.moreRow}
            >
              <Text style={styles.sectionActionText}>
                See all {times.length} times
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.footnote}>
            <Glyph name="alert" size={16} color={colors.textSecondary} />
            <Text style={styles.footnoteText}>
              These are the times you set. MedHelp doesn't know whether a dose
              was taken.
            </Text>
          </View>
        </>
      )}
    </View>
  );

  const refills =
    needingRefill.length === 0 ? null : (
      <Pressable
        onPress={() => navigation.navigate("MedicationList")}
        accessibilityRole="button"
        accessibilityHint="Opens your medication list"
        style={styles.refillCard}
      >
        <Glyph name="alert" size={18} color={colors.noticeText} />
        <Text style={styles.refillText}>
          {needingRefill.length === 1
            ? "1 medication needs a refill soon."
            : `${needingRefill.length} medications need a refill soon.`}
        </Text>
        <Glyph name="chevron" size={16} color={colors.noticeText} />
      </Pressable>
    );

  const visits =
    openVisits.length === 0 ? null : (
      <View style={styles.section}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          Your appointments
        </Text>
        {openVisits.map((appointment) => (
          <Pressable
            key={appointment.id}
            onPress={() => navigation.navigate("AppointmentList")}
            accessibilityRole="button"
            accessibilityLabel={appointment.providerName}
            style={styles.visitCard}
          >
            {/*
              ⛔ The Care hue, because the tile means "this is a visit" — a
              place in the app, not a reading of the row. Whether anyone has
              been contacted is said in words underneath, on every card, and
              that is the only thing carrying it.
            */}
            <GlyphTile
              name="calendar"
              size={TILE.md}
              tint={domains.care.surface}
              color={domains.care.ink}
            />
            <View style={styles.visitBody}>
              <Text style={styles.visitName}>{appointment.providerName}</Text>
              {/*
                Repeated here rather than only in the list. The one thing a
                user must not misread is whether the clinic knows — MedHelp
                contacts nobody.
              */}
              {appointment.status === "REQUESTED" ? (
                <Text style={styles.visitWarning}>
                  {appointment.providerPhone
                    ? `Not arranged yet — call ${appointment.providerPhone} to fix a time.`
                    : "Not arranged yet — call the provider to fix a time."}
                </Text>
              ) : (
                <Text style={styles.visitMeta}>
                  {appointment.preferredTime
                    ? `Scheduled · ${appointment.preferredTime}`
                    : "Scheduled"}
                </Text>
              )}
            </View>
            <Glyph name="chevron" size={16} color={colors.borderStrong} />
          </Pressable>
        ))}
      </View>
    );

  const scopeNote = (
    <View style={styles.scopeNote}>
      <Glyph name="alert" size={18} color={colors.textSecondary} />
      <Text style={styles.scopeNoteText}>
        MedHelp provides general information only. It does not diagnose
        conditions or recommend treatment.
      </Text>
    </View>
  );

  const aside = (
    <View style={styles.aside}>
      <InfoPanel
        title="Where your information goes"
        items={WHERE_INFORMATION_GOES}
        footnote="MedHelp has not been reviewed by a clinician. It is a demonstration of the software rather than a medical service, and nothing in it should be relied on to decide whether you need care."
      />
      <InfoPanel
        title="What MedHelp will not do"
        items={WHAT_IT_WILL_NOT_DO}
        bullet="none"
        tone="muted"
      />
      {scopeNote}
      {/*
        Sign-out lives in the rail on a wide window and here on a narrow one —
        one place at a time, never both.
      */}
      {SPANISH_UI_ENABLED && (
        <SegmentedControl
          segments={LANGUAGES.map((option) => ({
            key: option.code,
            label: option.label,
            hint: t("language.label"),
          }))}
          selected={language}
          onSelect={(key) => void setLanguage(key as Language)}
        />
      )}
      {language === "es" && <Text style={styles.quietText}>{t("language.notice")}</Text>}
      <AppButton
        label={t("today.people")}
        variant="secondary"
        onPress={() => navigation.navigate("CareProfiles")}
        accessibilityHint="Keep medications, symptoms and visits for someone else separately"
      />
      {isExpanded ? null : (
        <AppButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          accessibilityHint="Ends your session on this device"
          style={styles.signOut}
        />
      )}
    </View>
  );

  return (
    <AppNav
      current="Today"
      navigation={navigation}
      onSignOut={handleSignOut}
      attention={
        needingRefill.length > 0 ? { Medications: needingRefill.length } : undefined
      }
    >
      {/*
        No `band`. Today opens on the greeting panel instead, which carries
        the date the band used to — one block at the top of the screen, not
        two.
      */}
      <Screen page={isExpanded} wide innerStyle={styles.screen}>
        {/*
          The rail carries the wordmark on a wide window, so repeating it here
          would name the app twice on one screen.
        */}
        {isExpanded ? null : (
          <View style={styles.topBar}>
            <Wordmark size={22} />
          </View>
        )}

        {greeting}

        <ProfileBanner
          active={active}
          profiles={profiles}
          onChange={() => navigation.navigate("CareProfiles")}
        />

        {error ? <ErrorNotice message={error} onRetry={load} /> : null}

        {loading && schedules === null && appointments === null ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Loading your day…</Text>
          </View>
        ) : null}

        <View style={[styles.body, isExpanded && styles.bodyExpanded]}>
          <View style={[styles.main, isExpanded && styles.mainExpanded]}>
            {symptomAction}
            {refills}
            {medicationTimes}
            {visits}
          </View>
          <View style={[styles.asideColumn, isExpanded && styles.asideColumnExpanded]}>
            {aside}
          </View>
        </View>
      </Screen>
    </AppNav>
  );
}

/**
 * ⛔ Statements about the *software*, not about health and not about the user.
 * Each restates something the repository already says. See `InfoPanel`.
 */
const WHAT_IT_WILL_NOT_DO = [
  { text: "It does not diagnose, and never names a condition you might have." },
  { text: "It does not recommend a treatment or tell you what to take." },
  { text: "It does not contact a clinic or book an appointment for you." },
  { text: "It is not a substitute for advice from a healthcare professional." },
];

const WHERE_INFORMATION_GOES = [
  {
    icon: "pill" as const,
    title: "A prescription label is read on your device",
    text: "The photograph is never uploaded, and only the fields you confirm are saved.",
  },
  {
    icon: "search" as const,
    title: "A provider search carries a ZIP code and a care setting",
    text: "Never what you wrote about your symptoms, and never your exact location.",
  },
  {
    icon: "clock" as const,
    title: "Reminder times are set by you",
    text: "MedHelp proposes times from the printed directions; nothing is scheduled until you save it.",
  },
];

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  body: {
    gap: spacing.lg,
  },
  bodyExpanded: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  main: {
    gap: spacing.lg,
    minWidth: 0,
  },
  mainExpanded: {
    flex: 3,
  },
  asideColumn: {
    minWidth: 0,
  },
  asideColumnExpanded: {
    flex: 2,
  },
  aside: {
    gap: spacing.md,
  },

  greeting: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  greetingTitle: {
    ...typography.band,
    color: colors.textOnAccent,
    flexShrink: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPressed,
  },
  greetingDate: {
    ...typography.caption,
    color: colors.textOnAccentMuted,
  },
  greetingChip: {
    alignSelf: "flex-start",
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPressed,
  },
  greetingChipText: {
    ...typography.captionStrong,
    color: colors.textOnAccent,
  },

  hero: {
    backgroundColor: domains.symptoms.fill,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heroExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textOnAccent,
  },
  heroBody: {
    ...typography.body,
    color: colors.textOnAccent,
  },
  // White fill, blue label: the one action on a filled panel, which is the
  // inverse of the same button anywhere else.
  heroButton: {
    backgroundColor: colors.background,
    borderColor: colors.background,
  },

  doseRow: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.surface,
    padding: spacing.md,
  },
  doseRowDue: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
  },
  doseRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  doseBody: {
    flex: 1,
    minWidth: 0,
  },
  doseName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  doseStanding: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  doseStandingDue: {
    ...typography.captionStrong,
    color: colors.noticeText,
  },

  section: {
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginRight: -spacing.sm,
  },
  sectionActionText: {
    ...typography.captionStrong,
    color: colors.accent,
  },

  moreRow: {
    minHeight: 32,
    justifyContent: "center",
  },
  footnote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  footnoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },

  quietCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quietTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  quietText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  refillCard: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  refillText: {
    ...typography.bodyStrong,
    color: colors.noticeText,
    flex: 1,
  },

  visitCard: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation.sm,
  },
  visitBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  visitName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  visitMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  visitWarning: {
    ...typography.caption,
    color: colors.noticeText,
  },

  scopeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  scopeNoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  signOut: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
