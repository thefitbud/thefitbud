import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

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

  return (
    <Screen title="Reset password" subtitle="We'll email you a code to reset your password.">
      {error ? <ErrorBanner message={error} /> : null}

      {step === "request" ? (
        <>
          <Field
            label="Mobile number or email"
            value={identifier}
            onChangeText={onChangeIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <PrimaryButton
            label="Send code"
            loading={loading}
            onPress={() => {
              void onRequestCode();
            }}
          />
        </>
      ) : null}

      {step === "verify" ? (
        <>
          <Text style={styles.copy}>Enter the code we sent to your email.</Text>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <PrimaryButton
            label="Continue"
            loading={loading}
            onPress={() => {
              void onVerifyCode(code.trim());
            }}
          />
        </>
      ) : null}

      {step === "set" ? (
        <>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            hint="At least 8 characters."
          />
          <PrimaryButton
            label="Save and sign in"
            loading={loading}
            onPress={() => {
              void onSetPassword(password);
            }}
          />
        </>
      ) : null}

      <PrimaryButton label="Back to sign in" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
});
