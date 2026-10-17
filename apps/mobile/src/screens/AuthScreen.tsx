import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { stage1Api } from "../lib/stage1Api";
import { CodeSignInScreen } from "./auth/CodeSignInScreen";
import { ForgotPasswordScreen } from "./auth/ForgotPasswordScreen";
import { SignInScreen } from "./auth/SignInScreen";

type AuthMode = "password" | "code" | "forgot";

export function AuthScreen() {
  const { api, signInWithToken, errorMessage, clearError } = useAuth();
  const s1 = stage1Api(api);
  const [mode, setMode] = useState<AuthMode>("password");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [forgotStep, setForgotStep] = useState<"request" | "verify" | "set">("request");
  const [otpProof, setOtpProof] = useState<string | null>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const displayError = localError ?? errorMessage;

  const finishAuth = useCallback(
    async (token: string) => {
      clearError();
      setLocalError(null);
      await signInWithToken(token);
    },
    [clearError, signInWithToken],
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
      await finishAuth(result.token);
    } catch {
      setLocalError("That mobile number or email and password don't match.");
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
    } catch {
      setLocalError("Too many codes requested. Try again in 1 hour or use your password.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(code: string) {
    if (code.length !== 6) {
      setLocalError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const result = await s1.verifyOtp({
        identifier: identifier.trim(),
        purpose: "login",
        code,
      });
      await finishAuth(result.token);
    } catch {
      setLocalError("That code didn't work. Check the latest message or tap Resend.");
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
    } catch {
      setLocalError("If an account exists, we've sent a code.");
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
      setOtpProof(result.otpProof ?? result.token);
      setForgotStep("set");
    } catch {
      setLocalError("That code didn't work. Request a new code.");
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
        await finishAuth(login.token);
      }
    } catch {
      setLocalError("Could not update password. Try again.");
    } finally {
      setLoading(false);
    }
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
    <SignInScreen
      loading={loading}
      error={displayError}
      onSignIn={signInPassword}
      onUseCode={() => {
        setMode("code");
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
  );
}
