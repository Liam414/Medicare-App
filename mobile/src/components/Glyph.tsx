import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "@/theme";

/**
 * Simple geometric marks, drawn from Views.
 *
 * There is deliberately no icon font or SVG library here. Adding one would be
 * a dependency (and, for a hosted font, a network request) for decoration
 * alone, and these shapes are simple enough to draw directly. They scale with
 * `size` and take their colour from the caller.
 *
 * Every glyph is decorative: it always sits beside a text label, never in
 * place of one, and is hidden from screen readers. Nothing in this app is
 * communicated by a picture alone.
 */

export type GlyphName =
  | "symptom"
  | "calendar"
  | "pill"
  | "clock"
  | "search"
  | "chevron"
  | "check"
  | "alert"
  | "mic";

interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
}

export function Glyph({ name, size = 22, color = colors.accent }: GlyphProps) {
  const stroke = Math.max(2, Math.round(size * 0.11));

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === "symptom" && (
        <>
          <View
            style={{
              position: "absolute",
              width: size * 0.3,
              height: size * 0.92,
              borderRadius: size * 0.1,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.92,
              height: size * 0.3,
              borderRadius: size * 0.1,
              backgroundColor: color,
            }}
          />
        </>
      )}

      {name === "calendar" && (
        <>
          <View
            style={{
              position: "absolute",
              top: size * 0.14,
              width: size * 0.88,
              height: size * 0.8,
              borderRadius: size * 0.16,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: size * 0.14,
              width: size * 0.88,
              height: size * 0.24,
              borderTopLeftRadius: size * 0.12,
              borderTopRightRadius: size * 0.12,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              left: size * 0.22,
              width: stroke,
              height: size * 0.2,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              right: size * 0.22,
              width: stroke,
              height: size * 0.2,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </>
      )}

      {name === "pill" && (
        <View
          style={{
            width: size * 0.96,
            height: size * 0.46,
            borderRadius: radius.pill,
            borderWidth: stroke,
            borderColor: color,
            transform: [{ rotate: "-45deg" }],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: stroke, height: size * 0.46, backgroundColor: color }} />
        </View>
      )}

      {name === "clock" && (
        <>
          <View
            style={{
              position: "absolute",
              width: size * 0.94,
              height: size * 0.94,
              borderRadius: radius.pill,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          {/* Hands run from the centre outwards, so no rotation origin is needed. */}
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.29,
              top: size * 0.21,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              height: stroke,
              width: size * 0.22,
              left: size * 0.5,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </>
      )}

      {name === "search" && (
        <>
          <View
            style={{
              position: "absolute",
              top: size * 0.04,
              left: size * 0.04,
              width: size * 0.66,
              height: size * 0.66,
              borderRadius: radius.pill,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: size * 0.08,
              right: size * 0.06,
              width: stroke,
              height: size * 0.34,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        </>
      )}

      {name === "chevron" && (
        <>
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.46,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [{ translateY: -size * 0.15 }, { rotate: "-45deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.46,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [{ translateY: size * 0.15 }, { rotate: "45deg" }],
            }}
          />
        </>
      )}

      {name === "check" && (
        <>
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.42,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [
                { translateX: -size * 0.22 },
                { translateY: size * 0.14 },
                { rotate: "-45deg" },
              ],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.78,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [{ translateX: size * 0.1 }, { rotate: "45deg" }],
            }}
          />
        </>
      )}

      {name === "alert" && (
        <>
          <View
            style={{
              position: "absolute",
              top: size * 0.08,
              width: stroke,
              height: size * 0.5,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: size * 0.08,
              width: stroke * 1.1,
              height: stroke * 1.1,
              borderRadius: radius.pill,
              backgroundColor: color,
            }}
          />
        </>
      )}

      {/* A capsule, a cradle under it and a stem: the universal microphone. */}
      {name === "mic" && (
        <>
          <View
            style={{
              position: "absolute",
              top: size * 0.06,
              width: size * 0.34,
              height: size * 0.5,
              borderRadius: radius.pill,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: size * 0.4,
              width: size * 0.62,
              height: size * 0.34,
              borderBottomLeftRadius: size * 0.31,
              borderBottomRightRadius: size * 0.31,
              borderWidth: stroke,
              borderTopColor: "transparent",
              borderLeftColor: color,
              borderRightColor: color,
              borderBottomColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: size * 0.04,
              width: size * 0.4,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </>
      )}
    </View>
  );
}

/**
 * A glyph — or a two-letter monogram — on a tinted **round** tile, the leading
 * element of a list row.
 *
 * `label` exists for the one case where a drawn shape loses to a word: "Rx" on
 * a medication row is instantly legible and a drawn pill is a guess. It takes
 * at most two characters, because a round tile cannot hold more without
 * shrinking the text below a readable size.
 *
 * Like every glyph this is decorative and hidden from screen readers — the
 * row's own text says what it is, and a monogram read aloud as "R X" before
 * every medication would be noise.
 */
export function GlyphTile({
  name,
  label,
  size = 44,
  tint = colors.accentSurface,
  color = colors.accent,
}: {
  name: GlyphName;
  /** Up to two characters shown instead of the glyph, e.g. "Rx". */
  label?: string;
  size?: number;
  tint?: string;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {label ? (
        <Text style={[styles.monogram, { fontSize: size * 0.34, color }]}>
          {label.slice(0, 2)}
        </Text>
      ) : (
        <Glyph name={name} size={size * 0.5} color={color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
  monogram: {
    fontFamily: fonts.sansBold,
    letterSpacing: 0.2,
  },
});
