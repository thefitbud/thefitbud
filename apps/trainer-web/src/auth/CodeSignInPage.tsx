import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AuthFlowError, useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { OtpCodeInput } from "./OtpCodeInput";
import { Button } from "../components/Button";
import { useConfig, isWhatsAppOtpEnabled } from "../lib/config";
import { apiClient } from "../lib/api";
import { fetchDevMailCode } from "../lib/auth-flow";
import { useOnline } from "../hooks/useOnline";

type Step = "request" | "verify";

export function CodeSignInPage() {
  const { me, loading, signInWithToken } = useAuth();
  const [params] = useSearchParams();
  const { config } = useConfig();
  const waOtp = isWhatsAppOtpEnabled(config);
  const online = useOnline();
  const nextRaw = params.get("next") ?? "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleGate, setRoleGate] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (!loading && me) {
    return <Navigate to={next} replace />;
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.startOtp({
        identifier: identifier.trim(),
        purpose: "login",
      });
      setMessage("If an account exists, we've sent a code.");
      setStep("verify");
      setCooldown(60);
      if (import.meta.env.DEV && identifier.includes("@")) {
        const devCode = await fetchDevMailCode(identifier.trim().toLowerCase());
        if (devCode) setCode(devCode);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send a code. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    setRoleGate(false);
    try {
      const result = await apiClient.verifyOtp({
        identifier: identifier.trim(),
        code: code.trim(),
        purpose: "login",
      });
      if (result.purpose === "login") {
        await signInWithToken(result.token, identifier.trim());
        return;
      }
      setError("That code didn't work. Check the latest message or resend.");
    } catch (err) {
      if (err instanceof AuthFlowError && err.code === "role") {
        setRoleGate(true);
        setError(err.message);
      } else if (err instanceof AuthFlowError) {
        setError(err.message);
      } else {
        setError("That code didn't work. Check the latest message or resend.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (roleGate) {
    return (
      <AuthLayout title="Client account" lead="" screenTestId="screen-TW-01">
        <div className="auth-role-gate" data-testid="trainee-only-gate">
          <p role="alert">
            This account is set up as a client. Open the FitBud app on your phone.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in with a code"
      lead="We'll email a 6-digit code. No SMS."
      screenTestId="screen-TW-01-code"
    >
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to continue.
        </p>
      ) : null}
      {step === "request" ? (
        <form className="auth-form" onSubmit={sendCode}>
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
              {!waOtp ? (
                <span className="chip-coming" data-testid="wa-otp-coming-soon">
                  Coming soon
                </span>
              ) : null}
            </label>
            {!waOtp ? (
              <p className="muted">
                Codes on WhatsApp are coming soon. For now we&apos;ll email your
                code; check spam if you don&apos;t see it.
              </p>
            ) : (
              <p className="muted">
                We&apos;ll send the same 6-digit code to your WhatsApp and your
                email. Use whichever arrives first.
              </p>
            )}
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
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          {message ? <p className="form-success">{message}</p> : null}
          <p className="muted">Sent to {maskIdentifier(identifier)}</p>
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
            disabled={submitting || code.length !== 6 || !online}
          >
            {submitting ? "Verifying…" : "Verify and sign in"}
          </Button>
          <button
            type="button"
            className="button-ghost"
            disabled={cooldown > 0 || submitting || !online}
            onClick={() => void sendCode()}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </form>
      )}
      <p className="auth-alt-links">
        <Link to={`/sign-in?next=${encodeURIComponent(next)}`}>
          Use password instead
        </Link>
      </p>
    </AuthLayout>
  );
}

function maskIdentifier(value: string): string {
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    const masked =
      (local?.charAt(0) ?? "") + "•••" + (local?.slice(-1) ?? "");
    return `${masked}@${domain}`;
  }
  return `••••${value.slice(-4)}`;
}
