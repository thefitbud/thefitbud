import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AuthFlowError, useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { useConfig, isWhatsAppOtpEnabled } from "../lib/config";
import { fetchDevMailCode } from "../lib/auth-flow";
import { stage1Api } from "../lib/stage1-api";
import { useOnline } from "../hooks/useOnline";

type Step = "request" | "verify";

export function CodeSignInPage() {
  const { me, loading, signInWithToken } = useAuth();
  const [params] = useSearchParams();
  const { config } = useConfig();
  const waOtp = isWhatsAppOtpEnabled(config);
  const online = useOnline();
  const next = params.get("next") ?? "/";

  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      await stage1Api.startOtp({
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
    try {
      const result = await stage1Api.verifyOtp({
        identifier: identifier.trim(),
        code: code.trim(),
        purpose: "login",
      });
      if (
        typeof result === "object" &&
        result !== null &&
        "token" in result &&
        typeof (result as { token: unknown }).token === "string"
      ) {
        await signInWithToken(
          (result as { token: string }).token,
          identifier.trim(),
        );
        return;
      }
      setError("That code didn't work. Check the latest message or resend.");
    } catch (err) {
      if (err instanceof AuthFlowError) {
        setError(err.message);
      } else {
        setError("That code didn't work. Check the latest message or resend.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sign in with a code">
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to continue.
        </p>
      ) : null}
      {step === "request" ? (
        <form className="stack-form" onSubmit={sendCode}>
          <label className="field">
            <span>Mobile number or email</span>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={submitting || !online}
            />
          </label>
          <fieldset className="field">
            <legend>Send code to</legend>
            <label className="radio-row">
              <input type="radio" name="channel" checked readOnly />
              Email
            </label>
            <label className="radio-row is-disabled">
              <input type="radio" name="channel" disabled={!waOtp} />
              WhatsApp
              {!waOtp ? <span className="chip-coming">Coming soon</span> : null}
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
          <button
            type="submit"
            className="button-primary"
            disabled={submitting || !online}
          >
            {submitting ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form className="stack-form" onSubmit={verifyCode}>
          {message ? <p className="form-success">{message}</p> : null}
          <p className="muted">Sent to {maskIdentifier(identifier)}</p>
          <label className="field">
            <span>6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={submitting || !online}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="button-primary"
            disabled={submitting || code.length !== 6 || !online}
          >
            {submitting ? "Verifying…" : "Verify and sign in"}
          </button>
          <button
            type="button"
            className="text-btn"
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
