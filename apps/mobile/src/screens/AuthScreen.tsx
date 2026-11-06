import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { pickSessionRefresh } from "../lib/api";
import { authErrorCopy, mismatchedResponseCopy } from "../lib/authErrors";
import { BundleCommitBadge } from "../dev/BundleCommitBadge";
import { stage1Api } from "../lib/stage1Api";
import { AcceptInviteScreen } from "./AcceptInviteScreen";
import { CodeSignInScreen } from "./auth/CodeSignInScreen";
import { ForgotPasswordScreen } from "./auth/ForgotPasswordScreen";
import { SignInScreen } from "./auth/SignInScreen";
import { createCodeVerifier } from "./auth/verifyCodeErrorFlow";

type AuthMode = "password" | "code" | "forgot" | "invite";

function hasInviteQuery(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return Boolean(new URLSearchParams(window.location.search).get("invite"));
}

export function AuthScreen() {
  const { api, signInWithToken, errorMessage, clearError } = useAuth();
  const s1 = stage1Api(api);
  const [mode, setMode] = useState<AuthMode>(() =>
    hasInviteQuery() ? "invite" : "password",
  );
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [forgotStep, setForgotStep] = useState<"request" | "verify" | "set">(
    "request",
  );
  const [otpProof, setOtpProof] = useState<string | null>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const displayError = localError ?? errorMessage;

  const finishAuth = useCallback(
    async (result: { token: string }) => {
      clearError();
      setLocalError(null);
      await signInWithToken(result.token, pickSessionRefresh(result));
    },
    [clearError, signInWithToken],
  );

  // The controller outlives renders; it reads the latest closures through this ref.
  const latest = useRef({ identifier, s1, finishAuth });
  latest.current = { identifier, s1, finishAuth };
  const verifier = useRef(
    createCodeVerifier({
      verify: (code: string) =>
        latest.current.s1.verifyOtp({
          identifier: latest.current.identifier.trim(),
          purpose: "login",
          code,
        }),
      finish: async (result) => {
        if (result.purpose === "login") await latest.current.finishAuth(result);
      },
    }),
  );

  async function signInPassword(id: string, password: string) {
    if (!id || !password) {
      setLocalError("Enter your mobile number or email and password.");
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const result = await s1.login({ identifier: id, password });
      try {
        await finishAuth(result);
      } catch (err) {
        setLocalError(authErrorCopy(err, "session", "signInPassword.finish"));
      }
    } catch (err) {
      setLocalError(authErrorCopy(err, "password-login", "signInPassword"));
    } finally {
      setLoading(false);
    }
  }

  async function sendCode() {
    if (!identifier.trim()) {
      setLocalError("Enter your mobile number or email.");
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      await s1.startOtp({ identifier: identifier.trim(), purpose: "login" });
      setCodeSent(true);
      setResendSeconds(60);
    } catch (err) {
      setLocalError(authErrorCopy(err, "code-send", "sendCode"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(code: string) {
    if (code.length !== 6) {
      setLocalError("Enter the 6-digit code.");
      return;
    }
    // Synchronous guard first: a second tap in the same frame must do nothing.
    if (verifier.current.busy) return;
    setLoading(true);
    setLocalError(null);
    try {
      const outcome = await verifier.current.submit(code, identifier.trim());
      if (outcome.kind === "error") setLocalError(outcome.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestReset() {
    setLoading(true);
    setLocalError(null);
    try {
      await s1.startOtp({ identifier: identifier.trim(), purpose: "reset" });
      setForgotStep("verify");
      setResendSeconds(60);
    } catch (err) {
      setLocalError(authErrorCopy(err, "reset-send", "requestReset"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetCode(code: string) {
    setLoading(true);
    try {
      const result = await s1.verifyOtp({
        identifier: identifier.trim(),
        purpose: "reset",
        code,
      });
      if (result.purpose !== "reset") {
        setLocalError(mismatchedResponseCopy("verifyResetCode.purpose"));
        return;
      }
      setOtpProof(result.resetProof);
      setForgotStep("set");
    } catch (err) {
      setLocalError(authErrorCopy(err, "reset-verify", "verifyResetCode"));
    } finally {
      setLoading(false);
    }
  }

  async function setNewPassword(password: string) {
    if (password.length < 8) {
      setLocalError("Use at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      if (otpProof) {
        const login = await s1.resetPassword({
          resetProof: otpProof,
          newPassword: password,
        });
        try {
          await finishAuth(login);
        } catch (err) {
          setLocalError(authErrorCopy(err, "session", "setNewPassword.finish"));
        }
      }
    } catch (err) {
      setLocalError(authErrorCopy(err, "reset-set", "setNewPassword"));
    } finally {
      setLoading(false);
    }
  }

  if (mode === "invite") {
    return (
      <AcceptInviteScreen
        onBackToSignIn={() => {
          setMode("password");
          clearError();
          setLocalError(null);
        }}
      />
    );
  }

  if (mode === "code") {
    return (
      <CodeSignInScreen
        identifier={identifier}
        loading={loading}
        error={displayError}
        onChangeIdentifier={setIdentifier}
        onSendCode={sendCode}
        onVerify={verifyCode}
        onUsePassword={() => {
          setMode("password");
          setCodeSent(false);
          clearError();
          setLocalError(null);
        }}
        codeSent={codeSent}
        resendSeconds={resendSeconds}
      />
    );
  }

  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        loading={loading}
        error={displayError}
        step={forgotStep}
        identifier={identifier}
        onChangeIdentifier={setIdentifier}
        onRequestCode={requestReset}
        onVerifyCode={verifyResetCode}
        onSetPassword={setNewPassword}
        onBack={() => {
          setMode("password");
          setForgotStep("request");
          clearError();
          setLocalError(null);
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SignInScreen
        loading={loading}
        error={displayError}
        initialIdentifier={identifier}
        onIdentifierChange={setIdentifier}
        onSignIn={signInPassword}
        onUseCode={() => {
          setMode("code");
          clearError();
          setLocalError(null);
        }}
        onHaveInviteCode={() => {
          setMode("invite");
          clearError();
          setLocalError(null);
        }}
        onForgotPassword={() => {
          setMode("forgot");
          setForgotStep("request");
          clearError();
          setLocalError(null);
        }}
      />
      <BundleCommitBadge />
    </View>
  );
}
