import { Eye, EyeOff, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthFlowError, useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { Button } from "../components/Button";
import { useConfig, isWhatsAppOtpEnabled } from "../lib/config";
import { useOnline } from "../hooks/useOnline";

const DEMO_PASSWORD = "FitBud-demo-2026";

function looksLikeMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && !value.includes("@");
}

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
  const [roleGate, setRoleGate] = useState(false);

  const nextRaw =
    params.get("next") ??
    (location.state as { from?: string } | null)?.from ??
    "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  if (!loading && me) {
    return <Navigate to={next} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    setRoleGate(false);
    try {
      await signInWithPassword(identifier.trim(), password);
    } catch (err) {
      if (err instanceof AuthFlowError && err.code === "role") {
        setRoleGate(true);
        setError(err.message);
      } else if (err instanceof AuthFlowError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (roleGate) {
    return (
      <AuthLayout
        title="Client account"
        lead=""
        screenTestId="screen-TW-01"
        showGlimpse={false}
      >
        <div className="auth-role-gate" data-testid="trainee-only-gate">
          <p role="alert">
            This account is set up as a client. Open the FitBud app on your phone.
          </p>
          <div className="auth-store-links">
            <a
              className="button-secondary"
              href="https://apps.apple.com/app/fitbud"
            >
              App Store
            </a>
            <a
              className="button-secondary"
              href="https://play.google.com/store/apps/details?id=com.thefitbud.app"
            >
              Google Play
            </a>
          </div>
          <p className="auth-alt-links">
            <Link to="/sign-in">Try another account</Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Welcome back, coach" screenTestId="screen-TW-01">
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Connect to sign in.
        </p>
      ) : null}
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Mobile number or email</span>
          <span className="input-shell">
            <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="text"
              name="username"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={submitting || loading || !online}
            />
          </span>
          {looksLikeMobile(identifier) ? (
            <span className="field-hint">+91 prefix applied for Indian mobiles</span>
          ) : null}
        </label>
        <label className="field">
          <span className="field-label-row">
            <span>Password</span>
            <Link
              className="link"
              to={`/forgot-password?next=${encodeURIComponent(next)}`}
            >
              Forgot password?
            </Link>
          </span>
          <span className="input-shell">
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
              className="input-icon-btn"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <EyeOff size={16} strokeWidth={1.75} />
              ) : (
                <Eye size={16} strokeWidth={1.75} />
              )}
            </button>
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
          disabled={submitting || loading || !online}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <div className="auth-or" aria-hidden="true">
          or
        </div>
        <Link
          to={`/sign-in/code?next=${encodeURIComponent(next)}`}
          className="button-secondary btn-lg btn-block"
        >
          <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
          Sign in with a code instead
        </Link>
      </form>
      <div className="auth-note">
        <span>Trainer accounts only. Clients use the FitBud app.</span>
      </div>
      {import.meta.env.DEV ? (
        <details className="dev-auth-panel">
          <summary>Development test identity</summary>
          <p className="muted">
            Bypasses password login with the API test token double.
          </p>
          <button
            type="button"
            className="button-secondary"
            disabled={submitting}
            onClick={() => {
              void signInDevTest(
                identifier.trim() || "coach@example.com",
              ).catch((err: unknown) => {
                if (err instanceof AuthFlowError && err.code === "role") {
                  setRoleGate(true);
                }
                setError(
                  err instanceof Error ? err.message : "Test sign-in failed.",
                );
              });
            }}
          >
            Use test identity
          </button>
        </details>
      ) : null}
      {!isWhatsAppOtpEnabled(config) ? null : null}
    </AuthLayout>
  );
}
