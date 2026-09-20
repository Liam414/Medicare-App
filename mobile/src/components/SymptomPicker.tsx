import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AREA_LABELS,
  browsableAreas,
  matchSymptoms,
  relatedByArea,
  symptomById,
  symptomsInArea,
  type Area,
  type Symptom,
} from "@/services/symptomVocabulary";
import { useDomain } from "@/hooks/useDomain";
import {
  MIN_TAP_TARGET,
  colors,
  elevation,
  fonts,
  radius,
  spacing,
  typography,
  type Domain,
} from "@/theme";

/**
 * Suggests lay symptom phrases as somebody types, and collects the ones they
 * pick into a list.
 *
 * ⛔ WHAT THIS COMPONENT IS NOT ALLOWED TO DO.
 *
 * - It never shows a severity, a tier, a colour meaning urgency, or an
 *   ordering by seriousness. Urgency is decided once, downstream, by the
 *   classifier reading the whole description. A symptom that looked "mild"
 *   here would be reassurance MedHelp authored, and the triage design is
 *   explicit that nothing may lower a tier.
 * - It never names a condition. The vocabulary contains none; do not add one.
 * - It never replaces what the user typed. The description stays exactly as
 *   written, and picked phrases travel BESIDE it as a separate list, so the
 *   person can always see which words are theirs and which are the app's.
 * - It never presents the related list as clinically connected. Those are
 *   other phrases about the same part of the body — see `relatedByArea` — and
 *   the heading has to keep saying so.
 *
 * Nothing here decides anything. It assembles text for a classifier that has
 * its own reviewed rules, and every phrase it offers is visible and removable
 * before the user submits.
 */

interface SymptomPickerProps {
  /** What the user has typed. Read only — this component never edits it. */
  description: string;
  /** Ids already chosen, in tap order. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SymptomPicker({
  description,
  selectedIds,
  onChange,
  disabled = false,
}: SymptomPickerProps) {
  /*
    ⛔ THE PICKER IS PAINTED IN THE SYMPTOMS COLOUR, NOT THE GLOBAL ACCENT.

    Every other control on this screen — the icon tile, the text field's focus
    ring, the submit button, the meter down the page edge — reads `useDomain()`
    and comes out Symptoms blue. This component alone used `colors.accent`,
    which is the teal of `today`, so the one block a person actually interacts
    with was the one block fighting the band above it.

    ⛔ A domain colour is a PLACE and never a severity. It says "you are in
    Symptoms"; it must never be chosen from what the person described. See the
    fence on `domains` in theme.ts.
  */
  const domain = useDomain();

  const suggestions = useMemo(
    () => matchSymptoms(description, selectedIds),
    [description, selectedIds]
  );

  /*
    Anything already offered above is excluded here.

    A phrase can legitimately reach both lists — typing "my throat is really
    sore" matches "an earache" on the word "sore", and choosing "a sore throat"
    also makes every ear-nose-throat phrase a neighbour — and the same chip
    twice reads as two different things to add.
  */
  const related = useMemo(
    () => relatedByArea(selectedIds, [...selectedIds, ...suggestions.map((s) => s.id)]),
    [selectedIds, suggestions]
  );

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => symptomById(id))
        .filter((symptom): symptom is Symptom => symptom !== undefined),
    [selectedIds]
  );

  const add = (id: string) => onChange([...selectedIds, id]);
  const remove = (id: string) => onChange(selectedIds.filter((each) => each !== id));

  /*
    The areas named in the related heading. Plural areas are joined plainly
    rather than being reduced to one, because picking the "main" area would be
    a judgement about which complaint matters most — which is the ranking this
    component is not allowed to do.
  */
  const relatedAreas = useMemo(() => {
    const areas = new Set(related.map((symptom) => AREA_LABELS[symptom.area]));
    return [...areas];
  }, [related]);

  /*
    Browsing, which is what makes typing optional.

    ⛔ THIS COMPONENT NO LONGER RETURNS NULL WHEN NOTHING IS TYPED, and that is
    the point rather than an oversight. It used to: `matchSymptoms` needs three
    characters before it offers anything, so on an empty screen there was
    nothing to show and nothing to tap, and the only way to reach the
    vocabulary was to start writing. Someone who cannot easily type — which
    includes a lot of people who are unwell — had no way in at all.

    One area is open at a time. A list of two hundred phrases is not a list
    anybody reads; a list of twenty body areas is.
  */
  const areas = useMemo(() => browsableAreas(), []);
  const [openArea, setOpenArea] = useState<Area | null>(null);

  const browseList = useMemo(
    () => (openArea ? symptomsInArea(openArea, selectedIds) : []),
    [openArea, selectedIds]
  );

  return (
    <View style={styles.wrap}>
      {selected.length > 0 && (
        /*
          The one block with a filled ground, because it is the only one that
          is the person's own answer rather than something MedHelp is offering.
          A tinted panel is how the rest of the app marks "this is yours".
        */
        <View
          style={[
            styles.answerPanel,
            { backgroundColor: domain.surface, borderColor: domain.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: domain.ink }]}>
            Symptoms you have added
          </Text>
          <Text style={styles.note}>
            These are sent along with what you wrote. Remove any that are not
            right.
          </Text>
          <View style={styles.chipRow}>
            {selected.map((symptom) => (
              <SymptomChip
                key={symptom.id}
                symptom={symptom}
                added
                onPress={() => remove(symptom.id)}
                disabled={disabled}
                testGroup="selected"
                domain={domain}
              />
            ))}
          </View>
        </View>
      )}

      {suggestions.length > 0 && (
        <View style={styles.block}>
          <Text style={[styles.sectionLabel, { color: domain.ink }]}>
            Did you mean any of these?
          </Text>
          <Text style={styles.note}>
            Matched to the words you typed. Adding one does not change what you
            wrote.
          </Text>
          <SuggestionList
            symptoms={suggestions}
            onPick={add}
            disabled={disabled}
            testGroup="matched"
            domain={domain}
          />
        </View>
      )}

      {related.length > 0 && (
        <View style={styles.block}>
          {/*
            ⛔ This heading carries the whole honesty of the feature. These are
            other things people say about the same part of the body — NOT
            symptoms MedHelp thinks go with the ones already picked. Do not
            reword it to imply a connection the app cannot know.
          */}
          <Text style={[styles.sectionLabel, { color: domain.ink }]}>
            Other things people describe about the {relatedAreas.join(" and ")}
          </Text>
          <Text style={styles.note}>
            Listed because they are about the same part of the body, not
            because MedHelp thinks they are connected to yours.
          </Text>
          <SuggestionList
            symptoms={related}
            onPick={add}
            disabled={disabled}
            testGroup="related"
            domain={domain}
          />
        </View>
      )}

      <View style={styles.block}>
        <Text style={[styles.sectionLabel, { color: domain.ink }]}>
          Or pick from a list
        </Text>
        <Text style={styles.note}>
          Choose a part of the body to see the things people describe about
          it. You can build your whole answer this way without typing
          anything.
        </Text>

        {/*
          ⛔ ONE THING ON SCREEN AT A TIME, AND AN AREA MUST NOT LOOK LIKE A
          SYMPTOM.

          Both halves of this were reported by the repository owner on
          2026-09-19. The twenty body areas were drawn as the same pill as a
          symptom phrase, wrapped into the same kind of row, so "head" and
          "eyes" read as things you might have rather than places to look —
          and every area stayed on screen underneath whichever one was open,
          so opening "chest" dropped its phrases into the middle of nineteen
          other buttons.

          Areas are now full-width rows: a menu, visibly not a chip. Opening
          one REPLACES the menu with that area's phrases behind a back row.

          ⛔ Nothing was removed. The same twenty areas and the same phrases
          are reachable, in the same number of taps, and the picker still
          offers no ordering, no severity and no condition.
        */}
        {openArea ? (
          <View style={styles.areaList}>
            <AreaRow
              area={openArea}
              open
              first
              onPress={() => setOpenArea(null)}
              disabled={disabled}
              domain={domain}
            />
            <View style={styles.browseOpen}>
              {browseList.length > 0 ? (
                <View style={styles.chipRow}>
                  {browseList.map((symptom) => (
                    <SymptomChip
                      key={symptom.id}
                      symptom={symptom}
                      added={false}
                      onPress={() => add(symptom.id)}
                      disabled={disabled}
                      testGroup="browse"
                      domain={domain}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.note}>
                  You have already added everything listed under{" "}
                  {AREA_LABELS[openArea]}.
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.areaList}>
            {areas.map((area, index) => (
              <AreaRow
                key={area}
                area={area}
                open={false}
                first={index === 0}
                onPress={() => setOpenArea(area)}
                disabled={disabled}
                domain={domain}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}



/**
 * One body area, in one of two states — the same one-component rule as
 * `SymptomChip` below, and for the same reason.
 *
 * ⛔ ONE COMPONENT, NOT TWO, SO THE LABEL CAN BE SEEN TO VARY. Written first
 * as a closed row and an open header row with a fixed label each: correct
 * output, unsafe shape, and `accessibleState.test.ts` failed it — two fixed
 * labels in two places cannot vary, so nothing tells the next person that the
 * open state has to be spoken. React Native Web 0.19.13 drops
 * `accessibilityState` entirely, so the label is the only thing a browser
 * reader gets.
 *
 * ⛔ It is deliberately not chip-shaped. An area is a place to look, not a
 * symptom you can add, and drawing the two the same is the confusion this
 * replaced.
 */
function AreaRow({
  area,
  open,
  first,
  onPress,
  disabled,
  domain,
}: {
  area: Area;
  open: boolean;
  first: boolean;
  onPress: () => void;
  disabled: boolean;
  domain: Domain;
}) {
  const count = symptomsInArea(area).length;

  return (
    <Pressable
      testID={`symptom-area-${area}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        open
          ? `${AREA_LABELS[area]}, showing ${count} phrases. Activate to hide them.`
          : `${AREA_LABELS[area]}, ${count} phrases. Activate to show them.`
      }
      style={[
        styles.areaRow,
        first && styles.areaRowFirst,
        open && { backgroundColor: domain.surface },
        disabled && styles.chipDisabled,
      ]}
    >
      {open && (
        <Text
          style={[styles.areaRowChevron, { color: domain.ink }]}
          accessibilityElementsHidden
        >
          ‹
        </Text>
      )}
      <Text
        style={
          open
            ? [styles.areaRowOpenLabel, { color: domain.ink }]
            : styles.areaRowLabel
        }
      >
        {AREA_LABELS[area]}
      </Text>
      {open ? (
        <Text
          style={[styles.areaRowBack, { color: domain.ink }]}
          accessibilityElementsHidden
        >
          All areas
        </Text>
      ) : (
        /*
          The count as a quiet pill rather than a bare numeral. Loose digits in
          a list of words read as part of the label; a pill reads as a tally,
          which is what it is.
        */
        <View style={styles.countPill}>
          <Text style={styles.countPillText} accessibilityElementsHidden>
            {count}
          </Text>
        </View>
      )}
      {!open && (
        <Text style={styles.areaRowChevron} accessibilityElementsHidden>
          ›
        </Text>
      )}
    </Pressable>
  );
}

/**
 * One symptom, in one of two states.
 *
 * ⛔ THERE IS ONE CHIP COMPONENT, NOT TWO, AND THAT IS WHY THE LABEL IS SAFE.
 *
 * The first draft of this file had a separate element for an added chip and an
 * offered chip, each with its state hard-coded into its own label. That is
 * correct output and an unsafe shape: `accessibleState.test.ts` reads each call
 * site and asks whether the label CAN differ between states, and two fixed
 * labels in two places cannot — so the next person to merge them, or to add a
 * third state, has nothing telling them the state has to be spoken.
 *
 * With one component the rule is enforceable: this label always says which
 * state it is in, and the guard can see that it varies.
 *
 * `accessibilityState` is kept beside it because it is right on native. React
 * Native Web 0.19.13 never reads it — it takes `aria-selected` instead — so on
 * the web the label is the only thing a reader gets, which is exactly why the
 * label carries the words.
 */
function SymptomChip({
  symptom,
  added,
  onPress,
  disabled,
  testGroup,
  domain,
}: {
  symptom: Symptom;
  added: boolean;
  onPress: () => void;
  disabled: boolean;
  testGroup: string;
  domain: Domain;
}) {
  return (
    <Pressable
      testID={`symptom-${testGroup}-${symptom.id}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: added }}
      accessibilityLabel={
        added
          ? `${symptom.label}, added. Activate to remove.`
          : `${symptom.label}, not added. Activate to add.`
      }
      style={[
        styles.chip,
        added && { backgroundColor: domain.fill, borderColor: domain.fill },
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        style={[
          styles.chipMark,
          { color: added ? colors.textOnAccent : domain.ink },
        ]}
        accessibilityElementsHidden
      >
        {added ? "✕" : "+"}
      </Text>
      <Text style={added ? styles.chipSelectedText : styles.chipText}>
        {symptom.label}
      </Text>
    </Pressable>
  );
}
function SuggestionList({
  symptoms,
  onPick,
  disabled,
  testGroup,
  domain,
}: {
  symptoms: Symptom[];
  onPick: (id: string) => void;
  disabled: boolean;
  testGroup: string;
  domain: Domain;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      accessibilityRole="list"
    >
      {symptoms.map((symptom) => (
        <SymptomChip
          key={symptom.id}
          symptom={symptom}
          added={false}
          onPress={() => onPick(symptom.id)}
          disabled={disabled}
          testGroup={testGroup}
          domain={domain}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  block: { gap: spacing.xs },

  /*
    Section labels, not headings. `overline` is the app's label voice — the
    same one used above a group of rows elsewhere — and it is set in the
    destination's ink so the picker's sections read as parts of THIS screen
    rather than as a widget dropped onto it.

    ⛔ 13px is the floor and is an accessibility decision, not a preference:
    small label type is the first thing to fail for anyone with low vision.
    Do not take `overline` smaller to make this look tidier.
  */
  sectionLabel: { ...typography.overline },
  note: { ...typography.caption, color: colors.textSecondary },

  /* The person's own answer, on a tinted ground. */
  answerPanel: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  /*
    ⛔ A chip is never coloured from a safety family. The emergency, error and
    notice palettes carry a reviewed meaning about urgency, and a symptom chip
    asserts nothing about urgency — it is a phrase somebody tapped.
  */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipDisabled: { opacity: 0.5 },
  chipText: { ...typography.caption, color: colors.textPrimary },
  chipSelectedText: { ...typography.caption, color: colors.textOnAccent },
  chipMark: { ...typography.caption, fontFamily: fonts.sansBold },

  /*
    The body-area menu. ⛔ Deliberately NOT chip-shaped: it is the same
    bordered, hairline-divided card as `NavGroup`, because that is already
    this app's idiom for "a list of places you can go", and an area is a place
    to look rather than a symptom you can add. That confusion is what the row
    treatment replaced on 2026-09-19; this only makes it look like the rest of
    the app while it does it.
  */
  areaList: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...elevation.sm,
  },
  areaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth > 1 ? StyleSheet.hairlineWidth : 1,
    borderTopColor: colors.divider,
  },
  areaRowFirst: { borderTopWidth: 0 },
  areaRowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  areaRowOpenLabel: { ...typography.titleSmall, flex: 1 },
  areaRowBack: { ...typography.caption },
  areaRowChevron: { ...typography.body, color: colors.textMuted },

  countPill: {
    minWidth: 26,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
  },
  countPillText: { ...typography.caption, color: colors.textSecondary },

  browseOpen: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
