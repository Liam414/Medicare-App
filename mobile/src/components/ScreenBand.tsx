import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CONTENT_WIDTH, colors, spacing, typography } from "@/theme";

/**
 * The title at the top of a destination.
 *
 * ## It used to be a coloured plate, and is not any more
 *
 * The panel pass drew this as a full-bleed field of the destination's hue
 * with the name knocked out of it in white — the plate over a hospital
 * department door. It was the loudest thing in the app.
 *
 * The bright-card pass turns it back into a plain heavy title in `textPrimary`
 * on the white page. Two reasons, and the second is the one that mattered:
 *
 * 1. Every reference screen shows a dark title on white, with the colour
 *    spent on the one action instead.
 * 2. **A full-width field of saturated colour above a health screen competes
 *    with the notice families.** With five destination plates shouting, a
 *    disclaimer or an emergency banner had to shout louder to stay first in
 *    the reading order. Giving the page back to the content means the only
 *    large coloured areas left are the ones that carry safety meaning and the
 *    single primary action.
 *
 * The destination's hue has not gone anywhere — it is on the tab bar, the
 * filled button and the row tiles, which were already carrying it.
 *
 * ## ⛔ What may not go in it
 *
 * The band is signage: where you are, plus one plain line about the screen or
 * the software (`meta`) — which is where several screens state what MedHelp
 * will not do, because a refusal printed on the door plate is read and a
 * refusal in small grey type under a card is not. It is never a place for a
 * claim, a number about the person's health, or copy a reviewer has not read.
 */
interface ScreenBandProps {
  title: string;
  /** One quiet line under the title. See the fence above on what may go in it. */
  meta?: string;
  /** Trailing control, e.g. an edit link or an add button. */
  action?: ReactNode;
  /** Full page width, to match a `Screen` laid out in columns. */
  page?: boolean;
}

export function ScreenBand({ title, meta, action, page = false }: ScreenBandProps) {
  return (
    <View style={styles.band}>
      <View style={[styles.inner, page && styles.innerPage]}>
        <View style={styles.row}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: "100%",
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  inner: {
    width: "100%",
    maxWidth: CONTENT_WIDTH.wide,
    alignSelf: "center",
    gap: spacing.xs,
  },
  innerPage: {
    maxWidth: CONTENT_WIDTH.page,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    ...typography.displayLarge,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...typography.caption,
    maxWidth: 70 * 7,
    color: colors.textMuted,
  },
});
