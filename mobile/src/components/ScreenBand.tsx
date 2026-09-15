import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useDomain } from "@/hooks/useDomain";
import { CONTENT_WIDTH, colors, meter, spacing, typography } from "@/theme";

/**
 * Destination heading on a white surface, with the destination's color in
 * the title and divider. Shared spacing keeps screen changes predictable.
 *
 * ## ⛔ What may not go in it
 *
 * The band is signage: where you are, plus one plain line about the screen or
 * the software (`meta`) — which is where several screens now state what
 * MedHelp will not do, because a refusal printed on the door plate is read and
 * a refusal in small grey type under a card is not. It is never a place for a
 * claim, a number about the person's health, or copy a reviewer has not read.
 * Nothing in it may be tinted or worded by urgency — the hue is the
 * destination's, always, and never a reading of the content. See the fence on
 * `domains` in `theme.ts`.
 */
interface ScreenBandProps {
  title: string;
  /** One quiet line under the title. See the fence above on what may go in it. */
  meta?: string;
  /** Trailing control, e.g. an edit link. Rendered in the band's own ink. */
  action?: ReactNode;
  /** Full page width, to match a `Screen` laid out in columns. */
  page?: boolean;
}

export function ScreenBand({ title, meta, action, page = false }: ScreenBandProps) {
  const domain = useDomain();

  return (
    <View style={[styles.band, { backgroundColor: colors.surface, borderBottomColor: domain.border }]}>
      <View style={[styles.inner, page && styles.innerPage]}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: domain.ink }]} accessibilityRole="header">
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
    borderBottomWidth: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    // Clears the meter, which runs down the page on top of the band's left
    // edge. Without this the first letter would sit against it.
    paddingLeft: spacing.xl + meter.width,
  },
  inner: {
    width: "100%",
    maxWidth: CONTENT_WIDTH.wide,
    alignSelf: "center",
    gap: 2,
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
    ...typography.display,
    color: colors.textOnAccent,
    flexShrink: 1,
  },
  meta: {
    ...typography.caption,
    maxWidth: 70 * 7,
    color: colors.textSecondary,
  },
});
