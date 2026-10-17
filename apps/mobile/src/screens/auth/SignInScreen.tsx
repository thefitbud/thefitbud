import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { tagline } from "@fitbud/tokens";
import { useConfig } from "../../providers/ConfigProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { isWhatsAppOtpEnabled } from "../../lib/config";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../../lib/support";

type Props = {
  loading: boolean;
  error: string | null;
  onSignIn: (identifier: string, password: string) => Promise<void>;
  onUseCode: () => void;
  onForgotPassword: () => void;
  inviteTrainerName?: string | null;
};

export function SignInScreen({
  loading,
  error,
  onSignIn,
  onUseCode,
  onForgotPassword,
  inviteTrainerName,
}: Props) {
  const { config } = useConfig();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const waSoon = !isWhatsAppOtpEnabled(config);

  return (
    <Screen
      brandDisplay="mark"
      title={inviteTrainerName ? `Join ${inviteTrainerName}'s coaching` : "Sign in"}
      subtitle={inviteTrainerName ? tagline : "Progress, guided."}
    >
      {error ? <ErrorBanner message={error} /> : null}

      <Field
        label="Mobile number or email"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        placeholder="you@example.com or 9876543210"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        placeholder="Your password"
      />

      <PrimaryButton
        label="Sign in"
        loading={loading}
        onPress={() => {
          void onSignIn(identifier.trim(), password);
        }}
      />

      <Pressable accessibilityRole="button" onPress={onUseCode} style={styles.linkWrap}>
        <Text style={styles.link}>Sign in with a code instead</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onForgotPassword} style={styles.linkWrap}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>

      {waSoon ? (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>WhatsApp · Coming soon</Text>
          <Text style={styles.noteBody}>
            Codes on WhatsApp are coming soon. For now we&apos;ll email your code; check spam if
            you don&apos;t see it.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={styles.help}
        onPress={() => {
          void openSupportEmail({
            supportEmail: config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL,
            screenId: "TR-01",
            role: "trainee",
          });
        }}
      >
        <Text style={styles.link}>Need help?</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkWrap: {
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  link: {
    color: colors.indigo,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  note: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noteTitle: {
    color: colors.deepNavy,
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  noteBody: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
  },
  help: {
    alignItems: "center",
    marginTop: spacing.xxl,
    minHeight: 44,
    justifyContent: "center",
  },
});
