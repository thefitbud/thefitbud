import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { stage1Api } from "../lib/stage1Api";

const BULLETS = [
  "Your plan, day by day",
  "Log meals and workouts in a tap",
  "Your coach sees your progress",
];

function inviteParamsFromUrl(url: string | null): {
  token: string | null;
  email: string | null;
} {
  const empty = { token: null, email: null };
  if (!url) return empty;
  try {
    const parsed = Linking.parse(url);
    const qInvite = parsed.queryParams?.invite;
    const qEmail = parsed.queryParams?.email;
    const email = typeof qEmail === "string" && qEmail.trim() ? qEmail.trim() : null;
    if (typeof qInvite === "string" && qInvite.trim()) {
      return { token: qInvite.trim(), email };
    }
    const path = parsed.path ?? "";
    const inviteMatch = path.match(/(?:^|\/)invite\/([^/?#]+)/i);
    if (inviteMatch?.[1]) {
      return { token: decodeURIComponent(inviteMatch[1]), email };
    }
    const iMatch = path.match(/(?:^|\/)i\/([^/?#]+)/i);
    if (iMatch?.[1]) {
      return { token: decodeURIComponent(iMatch[1]), email };
    }
  } catch {
    // ignore
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    const email = params.get("email");
    if (invite?.trim()) {
      return { token: invite.trim(), email: email?.trim() || null };
    }
  }
  return empty;
}

type Props = {
  /** When embedded from signed-out AuthScreen. */
  onBackToSignIn?: () => void;
  initialToken?: string;
};

export function AcceptInviteScreen({
  onBackToSignIn,
  initialToken,
}: Props = {}) {
  const {
    api,
    refreshSession,
    signOut,
    signInWithToken,
    accessToken,
    errorMessage,
    clearError,
  } = useAuth();
  const s1 = stage1Api(api);
  const [token, setToken] = useState(initialToken?.trim() ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpProof, setOtpProof] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(!initialToken);
  const [trainerName, setTrainerName] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await Linking.getInitialURL();
      const fromLink = inviteParamsFromUrl(initial);
      if (!cancelled && fromLink.token && !token) {
        setToken(fromLink.token);
        setShowCode(false);
      }
      if (!cancelled && fromLink.email) setInviteEmail(fromLink.email);
    })();
    const sub = Linking.addEventListener("url", (event) => {
      const fromLink = inviteParamsFromUrl(event.url);
      if (fromLink.token) {
        setToken(fromLink.token);
        setShowCode(false);
      }
      if (fromLink.email) setInviteEmail(fromLink.email);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [token]);

  const preview = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed.length < 8) {
        setTrainerName(null);
        setPreviewStatus(null);
        return;
      }
      try {
        const result = await s1.getInvitationPreview(trimmed);
        setTrainerName(result.trainerDisplayName);
        setPreviewStatus(result.status);
        setLocalError(null);
        if (result.status === "expired" || result.status === "revoked") {
          setLocalError(
            "This invite link has expired or was already used. Ask your coach for a new one.",
          );
        }
      } catch (error) {
        if (error instanceof ApiClientError && (error.status === 410 || error.status === 409)) {
          setLocalError(
            "This invite link has expired. Ask your coach to send a new one.",
          );
          setPreviewStatus("expired");
        }
        setTrainerName(null);
      }
    },
    [s1],
  );

  useEffect(() => {
    if (token.trim().length >= 8) void preview(token);
  }, [token, preview]);

  async function sendInviteCode() {
    clearError();
    setLocalError(null);
    // Preview API does not return email (PII). For demo/dev the mail goes to
    // the invite recipient; ask the user only when we cannot infer it.
    const email = inviteEmail?.trim();
    if (!email) {
      setLocalError("Enter the email your coach invited, then request a code.");
      return;
    }
    setOtpSending(true);
    try {
      await s1.startOtp({ identifier: email, purpose: "invite" });
      setResendSeconds(60);
      setLocalError(null);
    } catch {
      setLocalError("Couldn't send a code. Check the email and try again.");
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyInviteCode() {
    clearError();
    setLocalError(null);
    const email = inviteEmail?.trim();
    if (!email || otpCode.trim().length !== 6) {
      setLocalError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const result = await s1.verifyOtp({
        identifier: email,
        purpose: "invite",
        code: otpCode.trim(),
      });
      if (result.purpose !== "invite" || !("otpProof" in result) || !result.otpProof) {
        setLocalError("That code didn't work. Check the latest email or resend.");
        return;
      }
      setOtpProof(result.otpProof);
    } catch {
      setLocalError("That code didn't work. Check the latest email or resend.");
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    clearError();
    setLocalError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setLocalError("Paste the invitation code from your coach.");
      setShowCode(true);
      return;
    }
    if (previewStatus === "expired" || previewStatus === "revoked") {
      setLocalError(
        "This invite link has expired. Ask your coach to send a new one.",
      );
      return;
    }

    // Signed-in returning trainee: link without password/OTP.
    if (accessToken && !password) {
      setLoading(true);
      try {
        await api.acceptInvitation({
          token: trimmed,
          displayName: displayName.trim() || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
        await refreshSession();
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 409) {
          setLocalError(
            "You're already coaching with someone on FitBud. Sign in to continue.",
          );
        } else {
          setLocalError(
            error instanceof ApiClientError
              ? error.message
              : messageFromError(error),
          );
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password.trim().length < 8) {
      setLocalError("Create a password with at least 8 characters.");
      return;
    }
    if (!otpProof) {
      setLocalError("Verify the code from your email before joining.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.acceptInvitation({
        token: trimmed,
        displayName: displayName.trim() || undefined,
        password: password.trim(),
        otpProof,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if ("token" in result && result.token) {
        await signInWithToken(result.token);
      } else {
        await refreshSession();
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 409) {
          setLocalError(
            "You're already coaching with someone on FitBud. Sign in to continue.",
          );
        } else {
          setLocalError(error.message);
        }
      } else {
        setLocalError(messageFromError(error));
      }
    } finally {
      setLoading(false);
    }
  }

  const displayError = localError ?? errorMessage;
  const coach = trainerName ?? "Your coach";
  const coachFirst = coach.split(/\s+/)[0] ?? "coach";
  const needsNewAccount = !accessToken;

  return (
    <Screen
      title="Join your coach"
      subtitle="Accept the invitation to start your FitBud coaching space."
      refreshing={false}
      onRefresh={() => {
        if (token.trim()) void preview(token);
      }}
    >
      {displayError ? <ErrorBanner message={displayError} /> : null}

      <View style={styles.card} accessibilityRole="summary">
        <Text style={styles.cardTitle} accessibilityRole="header">
          {trainerName
            ? `${trainerName} invited you to coaching on FitBud`
            : "You're invited to coaching"}
        </Text>
        {BULLETS.map((line) => (
          <Text key={line} style={styles.bullet}>
            • {line.replace("Your coach", coach)}
          </Text>
        ))}
      </View>

      <Field
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How your coach should address you"
      />

      {needsNewAccount ? (
        <>
          <Field
            label="Email from your invite"
            value={inviteEmail ?? ""}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Create a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="At least 8 characters"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword((v) => !v)}
            style={styles.linkHit}
          >
            <Text style={styles.link}>
              {showPassword ? "Hide password" : "Show password"}
            </Text>
          </Pressable>
          <Text style={styles.helper}>
            You&apos;ll sign in with your mobile number or email and this password.
          </Text>
          {!otpProof ? (
            <>
              <PrimaryButton
                label={resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Email me a code"}
                variant="secondary"
                loading={otpSending}
                onPress={() => {
                  void sendInviteCode();
                }}
              />
              <Field
                label="Verification code"
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                placeholder="6-digit code"
              />
              <PrimaryButton
                label="Verify code"
                variant="secondary"
                loading={loading}
                onPress={() => {
                  void verifyInviteCode();
                }}
              />
            </>
          ) : (
            <Text style={styles.verified}>Email verified</Text>
          )}
        </>
      ) : null}

      {showCode ? (
        <Field
          label="Invitation code"
          value={token}
          onChangeText={(value) => {
            setToken(value);
            void preview(value);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste code from your coach"
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Have a code instead"
          onPress={() => setShowCode(true)}
          style={styles.linkHit}
        >
          <Text style={styles.link}>Have a code instead?</Text>
        </Pressable>
      )}

      <PrimaryButton
        label={`Join ${coachFirst}`}
        loading={loading}
        onPress={() => {
          void accept();
        }}
      />

      {onBackToSignIn ? (
        <PrimaryButton
          label="Back to sign in"
          variant="ghost"
          onPress={onBackToSignIn}
        />
      ) : accessToken ? (
        <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "700",
  },
  bullet: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  linkHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  link: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  helper: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  verified: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
});
