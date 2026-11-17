import { useState } from "react";
import { View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { AuthPage, CodeBoxes, InlineError, TextLink } from "./authParts";

type Props = {
  identifier: string;
  loading: boolean;
  error: string | null;
  /** The API said `OTP_EXPIRED` (TR-01g): the main action becomes "Send a new code". */
  expired?: boolean;
  onChangeIdentifier: (value: string) => void;
  onSendCode: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onUsePassword: () => void;
  /** Back from the code boxes to the email step. */
  onChangeAddress: () => void;
  codeSent: boolean;
  resendSeconds: number;
};

function countdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * TR-01b (ask for a code), TR-01c (enter it) and TR-01g (it expired). The v3
 * mock drops the WhatsApp channel chips (v3 DECISIONS #18): codes go by email.
 */
export function CodeSignInScreen({
  identifier,
  loading,
  error,
  expired = false,
  onChangeIdentifier,
  onSendCode,
  onVerify,
  onUsePassword,
  onChangeAddress,
  codeSent,
  resendSeconds,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [code, setCode] = useState("");

  if (!codeSent) {
    return (
      <AuthPage
        onBack={onUsePassword}
        backLabel="Back to sign in"
        title="Sign in with a code"
        subtitle="We'll email you a 6-digit code. It works for 10 minutes."
        testID="sign-in-code-request"
      >
        {error ? <ErrorBanner message={error} /> : null}
        <Field
          label="Mobile number or email"
          value={identifier}
          onChangeText={onChangeIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
        />
        <Button
          label="Send code"
          loading={loading}
          onPress={() => {
            void onSendCode();
          }}
        />
      </AuthPage>
    );
  }

  return (
    <AuthPage
      onBack={onChangeAddress}
      title="Enter your code"
      subtitle={
        <Text variant="body" tone="ink2" style={styles.sent}>
          Sent to <Text style={styles.strong}>{identifier.trim()}</Text>
          {expired ? "." : ". Check spam if it isn't there."}
        </Text>
      }
      testID="sign-in-code-entry"
    >
      <CodeBoxes
        value={code}
        onChange={setCode}
        invalid={Boolean(error)}
        onComplete={(full) => {
          void onVerify(full);
        }}
      />
      {error ? <InlineError message={error} testID="sign-in-code-error" /> : null}

      {expired ? (
        <View style={styles.actions}>
          <Button
            label="Send a new code"
            loading={loading}
            icon={<RefreshCw color={theme.colors.onBrand} size={20} strokeWidth={2.25} />}
            onPress={() => {
              setCode("");
              void onSendCode();
            }}
          />
          <TextLink label="Use password instead" onPress={onUsePassword} />
        </View>
      ) : (
        <>
          <View style={styles.resendRow}>
            <Text tone="ink2" style={styles.resendText}>
              {resendSeconds > 0 ? `Resend in ${countdown(resendSeconds)}` : ""}
            </Text>
            <TextLink
              label="Resend code"
              disabled={resendSeconds > 0 || loading}
              onPress={() => {
                setCode("");
                void onSendCode();
              }}
            />
          </View>
          {code.length === 6 && error ? (
            <Button
              label="Verify and sign in"
              loading={loading}
              onPress={() => {
                void onVerify(code);
              }}
            />
          ) : null}
        </>
      )}
    </AuthPage>
  );
}

const useStyles = createThemedStyles((t) => ({
  sent: { lineHeight: 22 },
  strong: { color: t.colors.ink, fontWeight: "600" },
  actions: { gap: t.spacing.sm, marginTop: t.spacing.md },
  resendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: t.spacing.md,
  },
  resendText: { fontSize: 16 },
}));
