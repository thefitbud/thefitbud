import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#FEE2E2",
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  text: {
    color: colors.nearBlack,
    fontSize: 14,
    lineHeight: 20,
  },
});
