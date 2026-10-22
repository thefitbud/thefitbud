import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { OtpCodeInput } from "./OtpCodeInput";
import { Button } from "../components/Button";
import { useAuth } from "./AuthProvider";
import { fetchDevMailCode } from "../lib/auth-flow";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { useOnline } from "../hooks/useOnline";

type Step = "request" | "verify" | "password";

function passwordStrength(password: string): {
  label: string;
  level: "weak" | "fair" | "strong";
} {
  if (password.length < 8) return { label: "Too short (min 8)", level: "weak" };
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (password.length >= 12 && classes >= 3) {
    return { label: "Strong", level: "strong" };
  }
  if (classes >= 2) return { label: "Fair", level: "fair" };
  return { label: "Weak", level: "weak" };
}

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signInWithToken } = useAuth();
  const nextRaw = params.get("next") ?? "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const online = useOnline();
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [resetProof, setResetProof] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const strength = passwordStrength(newPassword);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.startOtp({
        identifier: identifier.trim(),
        purpose: "reset",
      });
      setMessage("If an account exists, we've sent a code.");
      setStep("verify");
      setCooldown(60);
      if (import.meta.env.DEV && identifier.includes("@")) {
        const devCode = await fetchDevMailCode(identifier.trim().toLowerCase());
        if (devCode) setCode(devCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    try {
      const verified = await stage1Api.verifyOtp({
        identifier: identifier.trim(),
        code: code.trim(),
        purpose: "reset",
      });
      if (
        typeof verified === "object" &&
        verified !== null &&
        "resetProof" in verified
      ) {
        setResetProof((verified as { resetProof: string }).resetProof);
        setMessage("Choose a new password.");
        setStep("password");
      } else {
        setError("That code didn't work. Check the latest message or resend.");
      }
    } catch {
      setError("That code didn't work. Check the latest message or resend.");
    } finally {
      setSubmitting(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!online || !resetProof) return;
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await stage1Api.resetPassword({
        resetProof,
        newPassword,
      });
      await signInWithToken(result.token, identifier.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      lead="We'll email a code, then you choose a new password."
      screenTestId="screen-TW-01-forgot"
      showGlimpse={false}
    >
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to continue.
        </p>
      ) : null}

      {step === "request" ? (
        <form className="auth-form" onSubmit={requestCode}>
          <label className="field">
            <span>Mobile number or email</span>
            <span className="input-shell">
              <input
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={submitting || !online}
              />
            </span>
          </label>
          <fieldset className="field auth-channel-fieldset">
            <legend>Send code to</legend>
            <label className="radio-row">
              <input type="radio" name="channel" checked readOnly />
              Email
            </label>
            <label className="radio-row is-disabled">
              <input type="radio" name="channel" disabled />
              WhatsApp
              <span className="chip-coming">Coming soon</span>
            </label>
            <p className="muted">
              Codes on WhatsApp are coming soon. For now we&apos;ll email your
              code; check spam if you don&apos;t see it.
            </p>
          </fieldset>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="btn-lg btn-block"
            disabled={submitting || !online}
          >
            {submitting ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : null}

      {step === "verify" ? (
        <form className="auth-form" onSubmit={verifyCode}>
          {message ? <p className="form-success">{message}</p> : null}
          <div className="field">
            <span className="field-label">6-digit code</span>
            <OtpCodeInput
              value={code}
              onChange={setCode}
              disabled={submitting || !online}
            />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="btn-lg btn-block"
            disabled={submitting || !online || code.length !== 6}
          >
            Verify code
          </Button>
          <button
            type="button"
            className="button-ghost"
            disabled={cooldown > 0 || submitting || !online}
            onClick={() => void requestCode()}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </form>
      ) : null}

      {step === "password" ? (
        <form className="auth-form" onSubmit={savePassword}>
          {message ? <p className="form-success">{message}</p> : null}
          <label className="field">
            <span>New password</span>
            <span className="input-shell">
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting || !online}
              />
            </span>
            <span className={`pwd-strength pwd-strength-${strength.level}`}>
              Strength: {strength.label}
            </span>
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="btn-lg btn-block"
            disabled={submitting || !online || newPassword.length < 8}
          >
            {submitting ? "Saving…" : "Save password and sign in"}
          </Button>
        </form>
      ) : null}

      <p className="auth-alt-links">
        <Link to={`/sign-in?next=${encodeURIComponent(next)}`}>
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
