import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { colors, spacing } from "@fitbud/ui-mobile";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `app` matches the trainee design: no product stamp, canvas background. */
  chrome?: "page" | "app";
};

export function Screen({
  title,
  subtitle,
  children,
  footer,
  chrome = "page",
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {chrome === "page" ? (
          <Text style={styles.brand} accessibilityRole="header">
            FitBud
          </Text>
        ) : null}
        <Text
          style={[styles.title, chrome === "app" ? styles.titleApp : null]}
          accessibilityRole="header"
          accessibilityLabel={title}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} accessibilityRole="text">
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  brand: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.deepNavy,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: spacing.sm,
    letterSpacing: -0.4,
  },
  titleApp: {
    fontSize: 30,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.midGrey,
    fontSize: 16,
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
    borderTopWidth: 1,
    borderTopColor: colors.lightGrey,
    backgroundColor: colors.background,
  },
});
