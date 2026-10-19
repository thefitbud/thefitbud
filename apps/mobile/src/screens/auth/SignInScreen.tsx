import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  colors,
  fontFamily,
  fontFamilyMedium,
  radii,
  spacing,
  typeScale,
} from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { useConfig } from "../../providers/ConfigProvider";
import { BrandMark } from "../../components/BrandMark";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
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
  const [showPassword, setShowPassword] = useState(false);
  const waSoon = !isWhatsAppOtpEnabled(config);

  return (
    <View style={styles.root}>
      <View style={styles.hero} accessibilityLabel="FitBud">
        <SafeAreaView>
          <View style={styles.heroInner}>
            <View style={styles.logoRow}>
              <BrandMark size={48} />
              <Text style={styles.logoWord}>FitBud</Text>
            </View>
            <Text style={styles.tagline}>Progress, guided.</Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title} accessibilityRole="header">
            {inviteTrainerName
              ? `Join ${inviteTrainerName}'s coaching`
              : "Sign in"}
          </Text>
          <Text style={styles.lead}>
            {inviteTrainerName
              ? "Create your account to start coaching."
              : "Your coach's plan for today is waiting."}
          </Text>

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
            secureTextEntry={!showPassword}
            textContentType="password"
            placeholder="Your password"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword((v) => !v)}
            style={styles.showPwd}
          >
            <Text style={styles.link}>
              {showPassword ? "Hide password" : "Show password"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            onPress={onForgotPassword}
            style={styles.forgot}
          >
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>

          <PrimaryButton
            label="Sign in"
            loading={loading}
            onPress={() => {
              void onSignIn(identifier.trim(), password);
            }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in with a code instead"
            onPress={onUseCode}
            style={styles.linkWrap}
          >
            <Text style={styles.link}>Sign in with a code instead</Text>
          </Pressable>

          {waSoon ? (
            <View style={styles.note} accessibilityLabel="WhatsApp Coming soon">
              <Text style={styles.noteTitle}>WhatsApp · Coming soon</Text>
              <Text style={styles.noteBody}>
                Codes on WhatsApp are coming soon. For now we&apos;ll email your
                code; check spam if you don&apos;t see it.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Need help"
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
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    backgroundColor: colors.deepNavy,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  heroInner: {
    gap: spacing.sm,
    paddingTop: spacing.xxl,
  },
  logoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  logoWord: {
    color: colors.white,
    fontFamily: fontFamilyMedium,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  tagline: {
    color: "rgba(255,255,255,0.8)",
    fontFamily,
    fontSize: 17,
    lineHeight: 24,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flex: 1,
    marginTop: -24,
  },
  sheetContent: {
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  title: {
    color: colors.deepNavy,
    fontFamily: fontFamilyMedium,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  lead: {
    color: colors.midGrey,
    fontFamily,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.lg,
    marginTop: 4,
  },
  showPwd: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    marginTop: -spacing.sm,
  },
  forgot: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
  },
  linkWrap: {
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  link: {
    fontFamily: fontFamilyMedium,
    color: colors.indigo,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  note: {
    backgroundColor: colors.paleLavender,
    borderRadius: radii.card,
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noteTitle: {
    fontFamily: fontFamilyMedium,
    color: colors.deepNavy,
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  noteBody: {
    fontFamily,
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
