import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useDomain } from "@/hooks/useDomain";
import {
  BORDER_WIDTH,
  EDGE_WIDTH,
  MIN_TAP_TARGET,
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from "@/theme";

/**
 * React Native's built-in `Button` renders as borderless blue text on iOS and
 * as a filled, uppercased button on Android, and it cannot show a disabled or
 * loading state. This component keeps one appearance everywhere and covers all
 * four interaction states (rest, hover on web, pressed, disabled/loading).
 *
 * ## The variants are the prominence ladder
 *
 * See `PROMINENCE_LEVELS` in `theme.ts`.
 *
 * - `primary` (L1) — filled. **One per screen**, with the emergency palette
 *   exempt: "Call 911" and the emergency card's contact call stay filled
 *   however many other filled controls are on screen.
 * - `outline` (L2) — a real control, but not the thing the screen is for.
 * - `secondary` (L3) — borderless text, for an action that sits beside
 *   something else rather than ending a task.
 *
 * ## The solid bottom edge
 *
 * A `primary` button carries a `EDGE_WIDTH` bottom border in the pressed
 * colour, and loses it while held down — so pressing it looks like the button
 * sinking onto the page. It replaces the drop shadow the panel pass used.
 *
 * ⛔ It is a **border**, not a shadow, on purpose: greyscale, forced-colours
 * and high-contrast rendering all discard shadows and all keep borders. A
 * button whose only affordance disappears in high contrast is a button a
 * low-vision user cannot find.
 *
 * ## The colour comes from the screen, not from here
 *
 * A filled button takes the current destination's hue (`useDomain`), so the
 * one action on the medications form is indigo and the one on the care form
 * is violet. That is what keeps five colours feeling like a system: the
 * colour is always answering "where am I", never "how urgent is this".
 */
type Variant = "primary" | "outline" | "secondary";

// react-native-web supports hover callbacks on Pressable; the react-native
// types don't declare them, so they're added here rather than cast away.
type HoverProps = {
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Spoken by screen readers after the label, e.g. "Opens the symptom list". */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
}: AppButtonProps) {
  const [hovered, setHovered] = useState(false);
  const domain = useDomain();
  const isPrimary = variant === "primary";
  // A button mid-request must not fire again: double-taps would send a second
  // signup/login request.
  const isInactive = disabled || loading;

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  // Rest, hover and pressed in the destination's own hue. Written out rather
  // than kept in the stylesheet because the value is only known at render.
  const tinted: StyleProp<ViewStyle> = isInactive
    ? null
    : isPrimary
      ? {
          backgroundColor: hovered ? domain.pressed : domain.fill,
          borderColor: hovered ? domain.pressed : domain.fill,
          borderBottomColor: domain.edge,
        }
      : variant === "outline"
        ? {
            // ⛔ A neutral border and a white fill, not the destination's hue.
            // Only ONE control on a screen wears the colour, and it is the
            // filled one — an outline button in the same hue reads as a second
            // primary and puts the reader back where the prominence ladder
            // exists to stop them being. The hue stays on the label.
            borderColor: colors.border,
            backgroundColor: hovered ? domain.surface : colors.background,
          }
        : hovered
          ? { backgroundColor: domain.surface }
          : null;

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        SURFACE[variant],
        tinted,
        pressed &&
          !isInactive &&
          (isPrimary
            ? {
                backgroundColor: domain.pressed,
                borderColor: domain.pressed,
                borderBottomColor: domain.pressed,
                // Sinks onto the page by giving back exactly the height the
                // edge occupied, so nothing around it shifts.
                borderBottomWidth: BORDER_WIDTH,
                marginTop: EDGE_WIDTH - BORDER_WIDTH,
                ...elevation.sm,
              }
            : { backgroundColor: domain.surface }),
        isInactive && INACTIVE[variant],
        style,
      ]}
    >
      <View style={styles.content}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={isPrimary ? colors.textOnAccent : domain.ink}
            style={styles.spinner}
          />
        )}
        <Text
          style={[
            styles.label,
            isPrimary ? styles.labelPrimary : { color: domain.ink },
            isInactive && LABEL_INACTIVE[variant],
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP_TARGET + spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    marginRight: spacing.sm,
  },

  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderBottomColor: colors.accentPressed,
    borderBottomWidth: EDGE_WIDTH,
    ...elevation.none,
  },
  primaryInactive: {
    backgroundColor: colors.accentDisabled,
    borderColor: colors.accentDisabled,
    /*
      A disabled button keeps the edge's HEIGHT and loses its colour.

      ⛔ Do not shrink `borderBottomWidth` here. Only the pressed state does
      that, and it pays the height back as `marginTop` so nothing around it
      moves. A disabled button that were 4pt shorter would make the control
      jump the moment a form became valid — which on this app's forms is the
      moment someone finishes typing and is looking straight at it.
    */
    borderBottomColor: colors.accentDisabled,
    borderBottomWidth: EDGE_WIDTH,
    ...elevation.none,
  },

  outline: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  outlineInactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },

  secondary: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  secondaryInactive: {
    backgroundColor: "transparent",
  },

  label: {
    ...typography.button,
    textAlign: "center",
  },
  labelPrimary: {
    color: colors.textOnAccent,
  },
  labelPrimaryInactive: {
    color: colors.textOnAccent,
  },
  labelAccentInactive: {
    color: colors.textSecondary,
  },
});

const SURFACE = {
  primary: styles.primary,
  outline: styles.outline,
  secondary: styles.secondary,
} as const;

const INACTIVE = {
  primary: styles.primaryInactive,
  outline: styles.outlineInactive,
  secondary: styles.secondaryInactive,
} as const;

const LABEL_INACTIVE = {
  primary: styles.labelPrimaryInactive,
  outline: styles.labelAccentInactive,
  secondary: styles.labelAccentInactive,
} as const;
