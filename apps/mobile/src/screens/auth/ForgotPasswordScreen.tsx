import { useState } from "react";
import { View } from "react-native";
import { CircleCheck, Circle } from "lucide-react-native";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { AuthPage, CodeBoxes, InlineError, PasswordInput } from "./authParts";

type Step = "request" | "verify" | "set";

type Props = {
  loading: boolean;
  error: string | null;
  step: Step;
  identifier: string;
  onChangeIdentifier: (value: string) => void;
  onRequestCode: () => Promise<void>;
  onVerifyCode: (code: string) => Promise<void>;
  onSetPassword: (password: string) => Promise<void>;
  onBack: () => void;
};

/** True when the password is (or contains) the sign-in identifier, ignoring case and spaces. */
export function passwordMatchesIdentifier(password: string, identifier: string): boolean {
  const id = identifier.trim().toLowerCase().replace(/\s+/g, "");
  const pw = password.trim().toLowerCase();
  if (!id || !pw) return false;
  const local = id.includes("@") ? id.slice(0, id.indexOf("@")) : id;
  const digits = id.replace(/\D/g, "");
  return (
    pw === id ||
    pw === local ||
    (digits.length >= 6 && pw.replace(/\D/g, "") === digits && /^\+?\d+$/.test(pw))
  );
}

/**
 * Forgot password: ask for a code, enter it, then TR-01d "Set a new password"
 * with the two live checks the mock draws.
 */
export function ForgotPasswordScreen({
  loading,
  error,
  step,
  identifier,
  onChangeIdentifier,
  onRequestCode,
  onVerifyCode,
  onSetPassword,
  onBack,
}: Props) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  if (step === "set") {
    const longEnough = password.length >= 8;
    const notIdentifier = password.length > 0 && !passwordMatchesIdentifier(password, identifier);
    return (
      <AuthPage
        onBack={onBack}
        title="Set a new password"
        subtitle={`For ${identifier.trim()}`}
        testID="set-new-password"
      >
        {error ? <ErrorBanner message={error} /> : null}
        <PasswordInput
          label="New password"
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
          autoFocus
        />
        <View style={{ marginTop: -8, marginBottom: 20, gap: 6 }}>
          <Check ok={longEnough} label="At least 8 characters" />
          <Check ok={notIdentifier} label="Not your number or email" />
        </View>
        <Button
          label="Save and sign in"
          loading={loading}
          disabled={!longEnough || !notIdentifier}
          onPress={() => {
            void onSetPassword(password);
          }}
        />
      </AuthPage>
    );
  }

  if (step === "verify") {
    return (
      <AuthPage
        onBack={onBack}
        title="Enter your code"
        subtitle={`Sent to ${identifier.trim()}. Check spam if it isn't there.`}
        testID="reset-code-entry"
      >
        <CodeBoxes
          value={code}
          onChange={setCode}
          invalid={Boolean(error)}
          onComplete={(full) => {
            void onVerifyCode(full);
          }}
        />
        {error ? <InlineError message={error} /> : null}
        <Button
          label="Continue"
          loading={loading}
          disabled={code.length !== 6}
          onPress={() => {
            void onVerifyCode(code.trim());
          }}
        />
      </AuthPage>
    );
  }

  return (
    <AuthPage
      onBack={onBack}
      backLabel="Back to sign in"
      title="Reset password"
      subtitle="We'll email you a code to reset your password."
      testID="reset-request"
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Field
        label="Mobile number or email"
        value={identifier}
        onChangeText={onChangeIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Button
        label="Send code"
        loading={loading}
        onPress={() => {
          void onRequestCode();
        }}
      />
    </AuthPage>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const Icon = ok ? CircleCheck : Circle;
  return (
    <View
      style={styles.check}
      accessibilityLabel={`${label}: ${ok ? "met" : "not met"}`}
    >
      <Icon color={ok ? theme.colors.done : theme.colors.ink3} size={20} strokeWidth={2} />
      <Text tone={ok ? "done" : "ink3"} style={styles.checkText}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles(() => ({
  check: { alignItems: "center", flexDirection: "row", gap: 8 },
  checkText: { fontSize: 16 },
}));
