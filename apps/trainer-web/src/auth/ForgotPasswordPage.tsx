import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { fetchDevMailCode } from "../lib/auth-flow";
import { stage1Api } from "../lib/stage1-api";
import { useOnline } from "../hooks/useOnline";

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const online = useOnline();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [resetProof, setResetProof] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    try {
      await stage1Api.startOtp({ identifier: identifier.trim(), purpose: "reset" });
      setMessage("If an account exists, we've sent a code.");
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
    setSubmitting(true);
    setError(null);
    try {
      await stage1Api.resetPassword({ resetProof, newPassword });
      window.location.href = `/sign-in?next=${encodeURIComponent(next)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {!resetProof ? (
        <>
          <form className="stack-form" onSubmit={requestCode}>
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
            {message ? <p className="form-success">{message}</p> : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button type="submit" className="button-secondary" disabled={submitting || !online}>
              Send code
            </button>
          </form>
          <form className="stack-form" onSubmit={verifyCode}>
            <label className="field">
              <span>6-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={submitting || !online}
              />
            </label>
            <button type="submit" className="button-primary" disabled={submitting || !online || code.length !== 6}>
              Verify code
            </button>
          </form>
        </>
      ) : (
        <form className="stack-form" onSubmit={savePassword}>
          {message ? <p className="form-success">{message}</p> : null}
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="button-primary" disabled={submitting || !online}>
            Save password
          </button>
        </form>
      )}
      <p className="auth-alt-links">
        <Link to={`/sign-in?next=${encodeURIComponent(next)}`}>Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
