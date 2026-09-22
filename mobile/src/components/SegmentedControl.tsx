import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDomain } from "@/hooks/useDomain";
import {
  MIN_TAP_TARGET,
  colors,
  radius,
  spacing,
  typography,
} from "@/theme";

/**
 * Two or three views of the same set of things.
 *
 * Used where the app previously had separate top-level destinations for one
 * set of objects: a medication and the times it is taken are the same record
 * seen two ways, and a reminder has no meaning apart from the medication it
 * belongs to. Splitting those across a hub made the user navigate between
 * them as if they were different features.
 *
 * Drawn as a row of pills that size to their own labels rather than as a
 * full-width inset track: the selected one is filled in the destination's
 * colour, which is the same mark the tab bar and the screen's one button
 * already use, so "which view am I on" is answered by the same language as
 * "where am I".
 *
 * ⛔ This is for alternative views, never for a filter that hides something
 * the user needs to see. A segment that concealed an overdue refill or an
 * unarranged appointment would make the app quieter about the thing it is
 * least entitled to be quiet about.
 */
export interface Segment {
  key: string;
  label: string;
  /** Spoken after the label. Say where this goes, not what it looks like. */
  hint?: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selected: string;
  onSelect: (key: string) => void;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function SegmentedControl({
  segments,
  selected,
  onSelect,
}: SegmentedControlProps) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => (
        <SegmentButton
          key={segment.key}
          segment={segment}
          active={segment.key === selected}
          onPress={() => onSelect(segment.key)}
        />
      ))}
    </View>
  );
}

function SegmentButton({
  segment,
  active,
  onPress,
}: {
  segment: Segment;
  active: boolean;
  onPress: () => void;
}) {
  const domain = useDomain();
  const [hovered, setHovered] = useState(false);
  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="tab"
      // ⛔ In the label, not only in `accessibilityState`, which reaches
      // nothing on web. See CLAUDE.md.
      accessibilityLabel={`${segment.label}, ${active ? "selected" : "not selected"}`}
      accessibilityHint={segment.hint}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.segment,
        active && { backgroundColor: pressed ? domain.pressed : domain.fill },
        !active && (hovered || pressed) && styles.segmentHovered,
      ]}
    >
      <Text
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
      >
        {segment.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  segment: {
    minHeight: MIN_TAP_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
  },
  segmentHovered: {
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textOnAccent,
  },
});
