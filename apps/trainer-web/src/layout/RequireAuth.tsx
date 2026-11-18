import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState } from "../components/StatePanels";
import { OfflineBanner } from "../components/OfflineBanner";
import { getStoredAccessToken } from "../lib/session";
import { AppShell } from "./AppShell";

export function RequireAuth() {
  const { me, loading, sessionError, refreshMe, clearSessionError } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="centered-status" aria-busy="true">
        <p>Loading session…</p>
      </main>
    );
  }

  // No token left (e.g. RECENT_SIGN_IN_REQUIRED after reactivate): send to
  // sign-in so the API message can show there. A token with a reachability
  // error still gets the retry panel.
  if (sessionError && !me && !getStoredAccessToken()) {
    const next = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/sign-in?next=${encodeURIComponent(next)}`}
        replace
        state={{ from: next }}
      />
    );
  }

  if (sessionError && !me) {
    return (
      <main className="centered-status">
        <ErrorState
          title="Can't reach FitBud"
          message={sessionError}
          onRetry={() => {
            clearSessionError();
            void refreshMe();
          }}
        />
      </main>
    );
  }

  if (!me) {
    const next = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/sign-in?next=${encodeURIComponent(next)}`}
        replace
        state={{ from: next }}
      />
    );
  }

  if (!me.permittedRoles.includes("trainer")) {
    return (
      <main className="centered-status" data-testid="trainee-only-gate">
        <h1>Client account</h1>
        <p>
          This account is set up as a client. Open the FitBud app on your phone.
        </p>
        <div className="auth-store-links">
          <a className="button-secondary" href="https://apps.apple.com/app/fitbud">
            App Store
          </a>
          <a
            className="button-secondary"
            href="https://play.google.com/store/apps/details?id=com.thefitbud.app"
          >
            Google Play
          </a>
        </div>
      </main>
    );
  }

  const onWelcome = location.pathname.startsWith("/welcome");
  if (!me.trainerProfile?.displayName && !onWelcome) {
    return <Navigate to="/welcome" replace />;
  }

  // First-run exits AppShell (Z12-2 / frames 125–128): focused chrome only.
  if (onWelcome) {
    return (
      <>
        <OfflineBanner />
        <Outlet />
      </>
    );
  }

  return (
    <AppShell>
      <OfflineBanner />
      <Outlet />
    </AppShell>
  );
}
