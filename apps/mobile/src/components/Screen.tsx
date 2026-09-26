import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { colors, spacing } from "@fitbud/ui-mobile";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Screen({ title, subtitle, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand} accessibilityRole="header">
          FitBud
        </Text>
        <Text
          style={styles.title}
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
