import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";
import { Lock } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/Button";
import {
  BrandRow,
  InviteHeroCard,
  M2Field,
  M2InputRow,
  M2Screen,
} from "../components/m2";
import { stage1Api } from "../lib/stage1Api";

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

function formatMobileDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(-10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

type Props = {
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
  const [mobileDigits, setMobileDigits] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpProof, setOtpProof] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showCodeEntry, setShowCodeEntry] = useState(!initialToken);
  const [showOtpEntry, setShowOtpEntry] = useState(false);
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
        setShowCodeEntry(false);
      }
      if (!cancelled && fromLink.email) setInviteEmail(fromLink.email);
      // Demo / capture: seed pending invite so hero shows the coach name.
      if (
        !cancelled &&
        !fromLink.token &&
        !token &&
        process.env.EXPO_PUBLIC_SCREEN_CAPTURE === "1"
      ) {
        setToken("fitbud-demo-anita-invite-pending");
        setInviteEmail("anita.invite@demo.fitbud.test");
        setShowCodeEntry(false);
      }
    })();
    const sub = Linking.addEventListener("url", (event) => {
      const fromLink = inviteParamsFromUrl(event.url);
      if (fromLink.token) {
        setToken(fromLink.token);
        setShowCodeEntry(false);
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
    const email = inviteEmail?.trim();
    if (!email) {
      setLocalError("Enter the email your coach invited, then request a code.");
      return;
    }
    setOtpSending(true);
    try {
      await s1.startOtp({ identifier: email, purpose: "invite" });
      setResendSeconds(60);
      setShowOtpEntry(true);
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
      setShowOtpEntry(false);
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
      setShowCodeEntry(true);
      return;
    }
    if (previewStatus === "expired" || previewStatus === "revoked") {
      setLocalError(
        "This invite link has expired. Ask your coach to send a new one.",
      );
      return;
    }

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
      await sendInviteCode();
      if (!inviteEmail?.trim()) return;
      setLocalError("Enter the 6-digit code we emailed you to continue.");
      return;
    }

    const mobileE164 =
      mobileDigits.replace(/\D/g, "").length >= 10
        ? `+91${mobileDigits.replace(/\D/g, "").slice(-10)}`
        : undefined;

    setLoading(true);
    try {
      const result = await api.acceptInvitation({
        token: trimmed,
        displayName: displayName.trim() || undefined,
        password: password.trim(),
        otpProof,
        mobileE164,
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
  const coachDisplay = trainerName ?? "Your coach";
  const coachFirst =
    (trainerName ?? coachDisplay).trim().split(/\s+/)[0] || null;
  const joinLabel =
    coachFirst && coachFirst.toLowerCase() !== "your"
      ? `Join ${coachFirst}`
      : "Join";
  const needsNewAccount = !accessToken;
  const emailLocked = Boolean(inviteEmail?.trim());

  const footer = (
    <View style={styles.footerStack}>
      <Button
        label={joinLabel}
        loading={loading}
        onPress={() => {
          void accept();
        }}
      />
      <Text style={styles.codeNote}>
        We&apos;ll email you a 6-digit code to confirm it&apos;s you.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowCodeEntry(true)}
        style={styles.codeLinkHit}
      >
        <Text style={styles.codeLink}>Have a code instead?</Text>
      </Pressable>
    </View>
  );

  return (
    <M2Screen footer={footer}>
      <BrandRow />
      {displayError ? <ErrorBanner message={displayError} /> : null}

      {trainerName ? (
        <InviteHeroCard coachName={trainerName} />
      ) : (
        <InviteHeroCard coachName={coachDisplay} />
      )}

      <M2Field label="Your name">
        <M2InputRow
          value={displayName}
          onChangeText={setDisplayName}
          inputProps={{
            placeholder: "How your coach should address you",
            autoCapitalize: "words",
          }}
        />
      </M2Field>

      {needsNewAccount ? (
        <>
          <M2Field label="Mobile number">
            <M2InputRow
              value={formatMobileDisplay(mobileDigits)}
              onChangeText={(text) =>
                setMobileDigits(text.replace(/\D/g, "").slice(0, 10))
              }
              prefix={<Text style={styles.prefix}>+91</Text>}
              inputProps={{
                keyboardType: "phone-pad",
                placeholder: "98201 45632",
              }}
            />
          </M2Field>
          <M2Field label="Email">
            <M2InputRow
              value={inviteEmail ?? ""}
              onChangeText={(text) => setInviteEmail(text)}
              readOnly={emailLocked}
              suffix={
                emailLocked ? (
                  <Lock size={18} color={colors.midGrey} strokeWidth={1.75} />
                ) : null
              }
              inputProps={{
                autoCapitalize: "none",
                keyboardType: "email-address",
                placeholder: "you@example.com",
              }}
            />
          </M2Field>
          <M2Field
            label="Create a password"
            help="At least 8 characters. You'll sign in with your mobile number or email and this password."
          >
            <M2InputRow
              value={password}
              onChangeText={setPassword}
              focused={password.length > 0}
              suffix={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Text style={styles.showPwd}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              }
              inputProps={{
                secureTextEntry: !showPassword,
                placeholder: "••••••••••",
              }}
            />
          </M2Field>
          {showOtpEntry ? (
            <>
              <M2Field label="6-digit code">
                <M2InputRow
                  value={otpCode}
                  onChangeText={setOtpCode}
                  inputProps={{
                    keyboardType: "number-pad",
                    placeholder: "000000",
                    maxLength: 6,
                  }}
                />
              </M2Field>
              <Button
                label={
                  resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"
                }
                variant="secondary"
                loading={otpSending}
                disabled={resendSeconds > 0}
                onPress={() => {
                  void sendInviteCode();
                }}
              />
              <Button
                label="Verify code"
                variant="secondary"
                loading={loading}
                onPress={() => {
                  void verifyInviteCode();
                }}
              />
            </>
          ) : otpProof ? (
            <Text style={styles.verified}>Email verified</Text>
          ) : null}
        </>
      ) : null}

      {showCodeEntry ? (
        <M2Field label="Invitation code">
          <M2InputRow
            value={token}
            onChangeText={(value) => {
              setToken(value);
              void preview(value);
            }}
            inputProps={{
              autoCapitalize: "none",
              placeholder: "Paste code from your coach",
            }}
          />
        </M2Field>
      ) : null}

      {onBackToSignIn ? (
        <Button label="Back to sign in" variant="tertiary" onPress={onBackToSignIn} />
      ) : accessToken ? (
        <Button label="Sign out" variant="tertiary" onPress={signOut} />
      ) : null}
    </M2Screen>
  );
}

const styles = StyleSheet.create({
  prefix: {
    color: colors.midGrey,
    fontSize: 16,
  },
  showPwd: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
  verified: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  footerStack: {
    gap: spacing.sm,
  },
  codeNote: {
    color: colors.midGrey,
    fontSize: 13,
    textAlign: "center",
  },
  codeLinkHit: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  codeLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
