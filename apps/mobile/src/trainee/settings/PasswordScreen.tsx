import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

type Props = {
  onBack: () => void;
};

export function PasswordScreen({ onBack }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "set">("request");
  const [otpProof, setOtpProof] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode() {
    if (!identifier.trim()) {
      setError("Enter your mobile number or email.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await s1.startOtp({ identifier: identifier.trim(), purpose: "reset" });
      setStep("verify");
    } catch {
      setError("If an account exists, we've sent a code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    try {
      const result = await s1.verifyOtp({
        identifier: identifier.trim(),
        purpose: "reset",
        code,
      });
      if (result.purpose !== "reset") {
        setError("That code didn't work.");
        return;
      }
      setOtpProof(result.resetProof);
      setStep("set");
    } catch {
      setError("That code didn't work.");
    } finally {
      setLoading(false);
    }
  }

  async function savePassword() {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (!otpProof) return;
    setLoading(true);
    setError(null);
    try {
      await s1.resetPassword({ resetProof: otpProof, newPassword: password });
      setDone(true);
    } catch {
      setError("Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Password" subtitle="Change password with an email code.">
      {error ? <ErrorBanner message={error} /> : null}
      {done ? (
        <View style={styles.stack}>
          <Text style={styles.body}>Password updated. Sign in with it next time.</Text>
          <PrimaryButton label="Done" onPress={onBack} />
        </View>
      ) : (
        <View style={styles.stack}>
          {step === "request" ? (
            <>
              <Field
                label="Mobile or email"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
              />
              <PrimaryButton
                label="Send code"
                loading={loading}
                onPress={() => void requestCode()}
              />
            </>
          ) : null}
          {step === "verify" ? (
            <>
              <Field label="6-digit code" value={code} onChangeText={setCode} />
              <PrimaryButton
                label="Verify"
                loading={loading}
                onPress={() => void verifyCode()}
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
              />
              <PrimaryButton
                label="Save password"
                loading={loading}
                onPress={() => void savePassword()}
              />
            </>
          ) : null}
          <PrimaryButton label="Cancel" variant="ghost" onPress={onBack} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  body: {
    color: colors.darkGrey,
    fontSize: 15,
    lineHeight: 22,
  },
});
