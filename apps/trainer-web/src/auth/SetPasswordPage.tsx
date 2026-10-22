import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Button } from "../components/Button";
import { useAuth } from "./AuthProvider";
import { stage1Api } from "../lib/stage1-api";
import { useOnline } from "../hooks/useOnline";

/** First sign-in for provisioned trainers: set a password (skippable once). */
export function SetPasswordPage() {
  const { me, loading, refreshMe } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const nextRaw = params.get("next") ?? "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !me) {
    return (
      <Navigate
        to={`/sign-in?next=${encodeURIComponent("/set-password")}`}
        replace
      />
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!online) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await stage1Api.setPassword({ newPassword: password });
      await refreshMe();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Set a password"
      lead="Optional for now — you can skip once and use a code next time."
      screenTestId="screen-TW-01-set-password"
      showGlimpse={false}
    >
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to continue.
        </p>
      ) : null}
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="field">
          <span>New password</span>
          <span className="input-shell">
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || !online}
            />
          </span>
        </label>
        <label className="field">
          <span>Confirm password</span>
          <span className="input-shell">
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting || !online}
            />
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
          disabled={submitting || !online}
        >
          {submitting ? "Saving…" : "Save password"}
        </Button>
      </form>
      <p className="auth-alt-links">
        <Link to={next}>Skip for now</Link>
      </p>
    </AuthLayout>
  );
}
