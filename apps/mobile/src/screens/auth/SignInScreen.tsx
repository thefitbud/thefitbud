import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Mail } from "lucide-react-native";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { legalUrl } from "../../lib/legalLinks";
import { wrongPasswordCopy, type AuthErrorKind } from "../../lib/authErrors";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  AuthPage,
  InlineError,
  OrDivider,
  PasswordInput,
  WaitBanner,
} from "./authParts";

type Props = {
  loading: boolean;
  error: string | null;
  /**
   * Which inline state the error is (TR-01e wrong password, TR-01f rate
   * limited). Set only when the API code or status proved it
   * (`classifyAuthError`); any other error shows in the banner.
   */
  errorKind?: AuthErrorKind | null;
  onSignIn: (identifier: string, password: string) => Promise<void>;
  onUseCode: () => void;
  onForgotPassword: () => void;
  inviteTrainerName?: string | null;
  /**
   * Value already held by AuthScreen. This screen remounts when the mode
   * changes, so the seed is what comes back from code or reset sign-in.
   */
  initialIdentifier?: string;
  /**
   * AuthScreen owns the identifier the code and reset screens submit.
   * Typing stays local until this reports it; without the report, "Sign in
   * with a code instead" opens an empty field and Send code never requests
   * an OTP (CU21).
   */
  onIdentifierChange?: (value: string) => void;
};

/**
 * TR-01a sign in, with TR-01e (wrong password, inline under the password) and
 * TR-01f (too many tries, a banner and a disabled Sign in). The v3 mock drops
 * the old "Show password" text link (the eye is inside the field), "Have a
 * code?", the WhatsApp "Coming soon" card and "Need help?" (Z12-18).
 */
export function SignInScreen({
  loading,
  error,
  errorKind = null,
  onSignIn,
  onUseCode,
  onForgotPassword,
  inviteTrainerName,
  initialIdentifier = "",
  onIdentifierChange,
}: Props) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const wrongPassword = Boolean(error) && errorKind === "wrong-credentials";
  const rateLimited = Boolean(error) && errorKind === "rate-limited";

  return (
    <AuthPage
      brand
      title={inviteTrainerName ? `Join ${inviteTrainerName}'s coaching` : "Sign in"}
      subtitle={
        inviteTrainerName
          ? "Create your account to start coaching."
          : "Use the mobile number or email your coach invited."
      }
      footer={<SignInFooter />}
      testID="sign-in"
    >
      {error && rateLimited ? <WaitBanner message={error} /> : null}
      {error && !wrongPassword && !rateLimited ? <ErrorBanner message={error} /> : null}

      <Field
        label="Mobile number or email"
        value={identifier}
        onChangeText={(value) => {
          setIdentifier(value);
          onIdentifierChange?.(value);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        placeholder="you@example.com or 9876543210"
      />
      <PasswordInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        textContentType="password"
        placeholder="Your password"
        invalid={wrongPassword}
      />
      {wrongPassword ? (
        <InlineError message={wrongPasswordCopy(identifier)} testID="sign-in-wrong-password" />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Forgot password"
        onPress={onForgotPassword}
        style={{ alignSelf: "flex-end", justifyContent: "center", marginTop: -8, minHeight: 44 }}
      >
        <Text tone="ink" style={{ fontSize: 16, fontWeight: "600" }}>Forgot password?</Text>
      </Pressable>

      <View style={{ marginTop: 16 }}>
        <Button
          label="Sign in"
          loading={loading}
          disabled={rateLimited}
          onPress={() => {
            void onSignIn(identifier.trim(), password);
          }}
        />
      </View>

      <OrDivider />

      <CodeInsteadButton onPress={onUseCode} />
    </AuthPage>
  );
}

function CodeInsteadButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Button
      label="Sign in with a code instead"
      variant="outline"
      icon={<Mail color={theme.colors.ink} size={22} strokeWidth={2} />}
      onPress={onPress}
    />
  );
}

function SignInFooter() {
  const styles = useStyles();
  return (
    <View style={styles.footer}>
      <Text tone="ink3" style={styles.footerText}>
        New to FitBud? Open the invite link your coach sent you.
      </Text>
      <View style={styles.legal}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Terms of use, opens in your browser"
          style={styles.legalLink}
          onPress={() => {
            void Linking.openURL(legalUrl("/terms"));
          }}
        >
          <Text tone="ink3" style={styles.footerText}>
            Terms
          </Text>
        </Pressable>
        <Text tone="ink3" style={styles.footerText}>
          ·
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Privacy policy, opens in your browser"
          style={styles.legalLink}
          onPress={() => {
            void Linking.openURL(legalUrl("/privacy"));
          }}
        >
          <Text tone="ink3" style={styles.footerText}>
            Privacy
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(() => ({
  footer: { alignItems: "center", gap: 0 },
  footerText: { fontSize: 14, lineHeight: 19, textAlign: "center" },
  legal: { alignItems: "center", flexDirection: "row", gap: 4 },
  legalLink: { justifyContent: "center", minHeight: 44, paddingHorizontal: 4 },
}));
