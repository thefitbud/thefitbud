import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthFlowError, useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { useConfig, isWhatsAppOtpEnabled } from "../lib/config";
import { useOnline } from "../hooks/useOnline";

const DEMO_PASSWORD = "FitBud-demo-2026";

export function SignInPage() {
  const { me, loading, signInWithPassword, signInDevTest } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const { config } = useConfig();
  const online = useOnline();
  const [identifier, setIdentifier] = useState(
    import.meta.env.DEV ? "rahul.coach@demo.fitbud.test" : "",
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? DEMO_PASSWORD : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next =
    params.get("next") ??
    (location.state as { from?: string } | null)?.from ??
    "/";

  if (!loading && me) {
    return <Navigate to={next.startsWith("/") ? next : "/"} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(identifier.trim(), password);
    } catch (err) {
      if (err instanceof AuthFlowError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome back, coach">
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to sign in.
        </p>
      ) : null}
      <form className="stack-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Mobile number or email</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={submitting || loading || !online}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || loading || !online}
            />
            <button
              type="button"
              className="text-btn"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="button-primary"
          disabled={submitting || loading || !online}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-alt-links">
        <Link to={`/sign-in/code?next=${encodeURIComponent(next)}`}>
          Sign in with a code instead
        </Link>
        {" · "}
        <Link to={`/forgot-password?next=${encodeURIComponent(next)}`}>
          Forgot password?
        </Link>
      </p>
      {import.meta.env.DEV ? (
        <details className="dev-auth-panel">
          <summary>Development test identity</summary>
          <p className="muted">
            Bypasses password login with the API test token double.
          </p>
          <button
            type="button"
            className="pill-btn"
            disabled={submitting}
            onClick={() => {
              void signInDevTest(identifier.trim() || "coach@example.com").catch(
                (err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : "Test sign-in failed.",
                  );
                },
              );
            }}
          >
            Use test identity
          </button>
        </details>
      ) : null}
      {!isWhatsAppOtpEnabled(config) ? (
        <p className="muted auth-wa-note">
          WhatsApp codes are coming soon. Email codes are available under &quot;Sign
          in with a code&quot;.
        </p>
      ) : null}
    </AuthLayout>
  );
}
