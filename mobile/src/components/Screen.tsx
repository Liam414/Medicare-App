import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DomainProvider } from "@/hooks/useDomain";
import { CONTENT_WIDTH, colors, spacing, type DomainName } from "@/theme";

/**
 * Shared page frame: a plain white ground, consistent padding, clear of the
 * keyboard, scrolling when content doesn't fit.
 *
 * Scrolling matters for accessibility as much as for small screens — at large
 * system font sizes these screens overflow even on a big phone, and a
 * non-scrolling View would put the submit button permanently out of reach.
 *
 * ## What the bright-card pass removed from here
 *
 * Two devices, both deliberate and both gone:
 *
 * - **The ruled chart-paper ground.** A 40pt tile of graph paper under every
 *   screen. It made the app look like a record rather than a tool.
 * - **The meter**, a 4pt coloured rule down the leading edge carrying the
 *   destination's hue. Its job — "which part of MedHelp am I in?" — is now
 *   done by the tab bar, the filled button and the tinted row tiles, all of
 *   which were already doing it too.
 *
 * Nothing was ever encoded in either that was not also written down on the
 * screen, which is what makes removing them safe rather than a loss of
 * information.
 */
interface ScreenProps {
  children: ReactNode;
  /**
   * The destination plate at the top of the page. Rendered outside the
   * content column so it runs edge to edge; pass a `ScreenBand`.
   */
  band?: ReactNode;
  /**
   * A companion column beside the content on a wide window, stacked under it
   * on a narrow one.
   *
   * ## Why this exists
   *
   * Every screen but Today was a single 480–660pt column in the middle of a
   * browser window, which left roughly half the width as bare ground. On the
   * ruled paper that reads emptier than it did on a flat one, because the grid
   * makes the emptiness measurable.
   *
   * ⛔ **This is not a slot for filler, and above all not for health
   * content.** It takes the same content `InfoPanel` takes and is bound by the
   * same fence: statements about the *software* — what it does with what you
   * just typed, what it will not do, where the data goes. No clinical text, no
   * numbers about the person's health, nothing a reviewer has not read. Read
   * the note at the top of `InfoPanel` before putting anything here.
   *
   * The content column keeps its own `wide`/`form` cap, so nothing here
   * lengthens a line of body text.
   */
  aside?: ReactNode;
  /** Vertically centres content — for short screens like sign-in. */
  centerContent?: boolean;
  /**
   * Widens the content column from form width to list width. Forms stay
   * narrow because a long input line is hard to scan; lists and result
   * screens carry cards that look starved in a 480pt column on a tablet.
   */
  wide?: boolean;
  /**
   * Full page width, for a screen that lays *columns* out beside each other
   * rather than stretching one column.
   *
   * ⛔ Do not reach for this to make a list or a form look less lonely on a
   * desktop. A 1180pt line of body text is harder to read than a 660pt one,
   * and this app is read by people who are unwell. Only pass it when the
   * children actually split into columns below that width — the Today screen
   * does, above `BREAKPOINT.expanded`.
   */
  page?: boolean;
  /**
   * Which destination this screen belongs to, for screens pushed on top of a
   * tab root. The tab roots themselves inherit it from `AppNav` and should
   * leave this alone.
   */
  domain?: DomainName;
  contentStyle?: StyleProp<ViewStyle>;
  /** Overrides the spacing rhythm of the content column itself. */
  innerStyle?: StyleProp<ViewStyle>;
}

export function Screen({ domain, children, ...rest }: ScreenProps) {
  if (domain) {
    return (
      <DomainProvider domain={domain}>
        <ScreenBody {...rest}>{children}</ScreenBody>
      </DomainProvider>
    );
  }

  return <ScreenBody {...rest}>{children}</ScreenBody>;
}

function ScreenBody({
  children,
  band,
  aside,
  centerContent = false,
  wide = false,
  page = false,
  contentStyle,
  innerStyle,
}: Omit<ScreenProps, "domain">) {
  const insets = useSafeAreaInsets();
  const { isExpanded } = useBreakpoint();

  // Two columns only where there is room for two. Below `expanded` the aside
  // is still rendered, stacked under the content — it is real information, not
  // decoration that can be dropped because the window is small.
  const split = Boolean(aside) && isExpanded;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // iOS slides content up; Android's adjustResize (Expo's default) already
      // handles this, and enabling it there causes double-padding.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, centerContent && styles.centered]}
          keyboardShouldPersistTaps="handled"
          alwaysBounceVertical={false}
        >
          {band}

          <View
            style={[
              styles.content,
              band ? styles.contentUnderBand : null,
              { paddingBottom: spacing.xl + insets.bottom },
              contentStyle,
            ]}
          >
            <View
              style={[
                styles.inner,
                wide && styles.innerWide,
                page && styles.innerPage,
                split && styles.innerSplit,
                innerStyle,
              ]}
            >
              <View
                style={[
                  styles.column,
                  split && styles.columnMain,
                  split && (wide ? styles.columnMainWide : styles.columnMainForm),
                ]}
              >
                {children}
              </View>
              {aside ? (
                <View style={[styles.column, split && styles.columnAside]}>{aside}</View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  centered: {
    justifyContent: "center",
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  contentUnderBand: {
    // The band has already paid the top margin, and doubling it leaves the
    // first card floating away from the plate it belongs to.
    paddingTop: spacing.lg,
  },
  inner: {
    // Keeps line lengths readable on tablets and in the browser preview
    // instead of stretching a form across the full width.
    width: "100%",
    maxWidth: CONTENT_WIDTH.form,
    alignSelf: "center",
    gap: spacing.lg,
  },
  innerWide: {
    maxWidth: CONTENT_WIDTH.wide,
  },
  // Listed after innerWide so it wins when a screen passes both.
  innerPage: {
    maxWidth: CONTENT_WIDTH.page,
  },
  // Wins over innerWide/innerPage: a split screen always gets the page width
  // to divide, whatever the content column asked for on its own.
  innerSplit: {
    maxWidth: CONTENT_WIDTH.page,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  column: {
    width: "100%",
    minWidth: 0,
    gap: spacing.lg,
  },
  columnMain: {
    flex: 3,
  },
  // The content column keeps its own line-length cap inside the split, so
  // widening the page never lengthens a line of body text.
  columnMainForm: {
    maxWidth: CONTENT_WIDTH.form,
  },
  columnMainWide: {
    maxWidth: CONTENT_WIDTH.wide,
  },
  columnAside: {
    flex: 2,
    maxWidth: 400,
  },
});
