import { Linking, StyleSheet, View } from "react-native";
import { Mail } from "lucide-react-native";
import { useAuth } from "../auth/AuthProvider";
import { Text } from "../components/Text";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import { reportError } from "../lib/reportError";
import { useConfig } from "../providers/ConfigProvider";
import { BrandMark } from "../components/BrandMark";
import { colors, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";

/** Frame 60: an account with no mobile role. Help and Sign out only. */
export function UnsupportedRoleScreen() {
  const { signOut } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;

  return (
    <Screen
      title="This account can't use the app yet"
      showHeader={false}
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label="Email FitBud support"
            icon={<Mail size={20} color={colors.white} />}
            onPress={() => {
              void Linking.openURL(
                `mailto:${supportEmail}?subject=${encodeURIComponent("FitBud support · Account can't use the app")}`,
              ).catch((error: unknown) => {
                reportError("UnsupportedRoleScreen.emailSupport", error);
              });
            }}
          />
          <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      }
    >
      <View style={styles.center}>
        <BrandMark size={36} />
        <Text style={styles.title} accessibilityRole="header">
          This account can't use the app yet
        </Text>
        <Text style={styles.body}>
          Contact support and we'll sort it out. We'll get back to you within a day.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  center: {
    alignItems: "center",
    paddingTop: 140,
    gap: spacing.lg,
  },
  title: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center",
  },
  body: {
    color: colors.midGrey,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
});
