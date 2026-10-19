import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/Text";
import { colors, spacing, typeScale } from "@fitbud/ui-mobile";
import { useConfig } from "../../providers/ConfigProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";
import { isWhatsAppOtpEnabled } from "../../lib/config";

type Props = {
  identifier: string;
  loading: boolean;
  error: string | null;
  onChangeIdentifier: (value: string) => void;
  onSendCode: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onUsePassword: () => void;
  codeSent: boolean;
  resendSeconds: number;
};

function maskIdentifier(raw: string): string {
  const value = raw.trim();
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at);
    if (local.length <= 2) return `${local[0] ?? ""}••${domain}`;
    return `${local[0]}•••${local[local.length - 1]}${domain}`;
  }
  if (value.length < 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function CodeSignInScreen({
  identifier,
  loading,
  error,
  onChangeIdentifier,
  onSendCode,
  onVerify,
  onUsePassword,
  codeSent,
  resendSeconds,
}: Props) {
  const { config } = useConfig();
  const [code, setCode] = useState("");
  const waSoon = !isWhatsAppOtpEnabled(config);

  useEffect(() => {
    if (!codeSent) return;
    const id = setInterval(() => {
      /* parent owns countdown */
    }, 1000);
    return () => clearInterval(id);
  }, [codeSent]);

  return (
    <Screen
      brandDisplay="mark"
      title="Sign in with a code"
      subtitle="We'll send a 6-digit code to your email."
    >
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.channelRow}>
        <Text style={styles.channelSelected}>Email</Text>
        <View style={styles.waDisabled}>
          <Text style={styles.waText}>WhatsApp</Text>
          {waSoon ? <Text style={styles.chip}>Coming soon</Text> : null}
        </View>
      </View>

      <Field
        label="Mobile number or email"
        value={identifier}
        onChangeText={onChangeIdentifier}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {!codeSent ? (
        <PrimaryButton
          label="Send code"
          loading={loading}
          onPress={() => {
            void onSendCode();
          }}
        />
      ) : (
        <>
          <Text style={styles.sentCopy}>
            Sent to {maskIdentifier(identifier)}. If an account exists, we&apos;ve
            emailed a code — check spam if you don&apos;t see it.
          </Text>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
          />
          <PrimaryButton
            label="Verify and sign in"
            loading={loading}
            onPress={() => {
              void onVerify(code.trim());
            }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={resendSeconds > 0}
            onPress={() => {
              void onSendCode();
            }}
            style={styles.linkWrap}
          >
            <Text style={[styles.link, resendSeconds > 0 ? styles.linkMuted : null]}>
              {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
            </Text>
          </Pressable>
        </>
      )}

      <Pressable accessibilityRole="button" onPress={onUsePassword} style={styles.linkWrap}>
        <Text style={styles.link}>Use password instead</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  channelRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  channelSelected: {
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    color: colors.indigo,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  waDisabled: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    opacity: 0.5,
    paddingVertical: spacing.sm,
  },
  waText: {
    color: colors.midGrey,
    fontWeight: "600",
  },
  chip: {
    backgroundColor: colors.lightGrey,
    borderRadius: 6,
    color: colors.darkGrey,
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sentCopy: {
    color: colors.midGrey,
    fontSize: typeScale.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
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
  linkMuted: {
    color: colors.midGrey,
  },
});
