import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { spacing } from "@fitbud/ui-mobile";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { BrandMark } from "./BrandMark";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `toast` is a floating slot above the tab bar (no bar border) for
   * snackbars like frame 05 Mark reviewed Undo.
   */
  footerVariant?: "bar" | "toast";
  /** `app` matches the trainee design: no product stamp, canvas background. */
  chrome?: "page" | "app";
  /** Auth screens use the Honest Week mark instead of the wordmark. */
  brandDisplay?: "text" | "mark" | "none";
  /** When false, omit the in-screen title block (shell provides AppTopBar). */
  showHeader?: boolean;
  refreshing?: boolean;
  /**
   * Pull-to-refresh handler. List screens should pass this (with `refreshing`)
   * instead of a manual Refresh button; screens that omit it still render fine.
   */
  onRefresh?: () => void;
  /**
   * Opt this screen in to dark (Z12-36): set it once the screen is migrated
   * to v3 tokens in its own W12 task. Without it the screen renders light
   * whatever the system says, because unmigrated content still uses v2 light
   * colours. Z12-58 checks that every screen sets it.
   */
  v3?: boolean;
};

/** Screen container. Light unless `v3` opts the screen in to the system theme. */
export function Screen({ v3 = false, ...props }: Props) {
  if (!v3) return <ScreenBody {...props} />;
  return (
    <ThemeScope scheme="system">
      <ScreenBody {...props} />
    </ThemeScope>
  );
}

function ScreenBody({
  title,
  subtitle,
  children,
  footer,
  footerVariant = "bar",
  chrome = "page",
  brandDisplay,
  showHeader = true,
  refreshing,
  onRefresh,
}: Omit<Props, "v3">) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} accessibilityRole="summary">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={theme.colors.ink3}
              colors={[theme.colors.brand]}
              progressBackgroundColor={theme.colors.card}
            />
          ) : undefined
        }
      >
        <View
          // `main` is a web/ARIA landmark, not an Android accessibilityRole:
          // react-native-web renders role="main" as <main>, and on Android the
          // `role` prop goes through the nullable Role.fromValue, so it is
          // ignored instead of throwing. See apps/mobile/src/components/accessibilityRole.test.ts.
          role="main"
          style={styles.main}
        >
          {showHeader ? (
            <>
              {chrome === "page"
                ? (() => {
                    const display = brandDisplay ?? "text";
                    if (display === "none") return null;
                    if (display === "mark") {
                      return <BrandMark size={36} />;
                    }
                    return (
                      <Text style={styles.brand} accessibilityRole="header">
                        FitBud
                      </Text>
                    );
                  })()
                : null}
              <Text
                variant="largeTitle"
                style={[styles.title, chrome === "app" ? styles.titleApp : null]}
                accessibilityRole="header"
                accessibilityLabel={title}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" tone="ink2" style={styles.subtitle} accessibilityRole="text">
                  {subtitle}
                </Text>
              ) : null}
            </>
          ) : null}
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
      {footer ? (
        <View
          style={
            footerVariant === "toast" ? styles.toastFooter : styles.footer
          }
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: {
    flex: 1,
    backgroundColor: t.colors.bg,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  main: {
    flexGrow: 1,
  },
  brand: {
    ...t.text.label.style,
    color: t.colors.brand,
    fontSize: 13,
    letterSpacing: 1.1,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.sm,
  },
  titleApp: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  body: {
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.line2,
    backgroundColor: t.colors.bg,
  },
  toastFooter: {
    backgroundColor: "transparent",
    paddingBottom: spacing.md,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
}));
