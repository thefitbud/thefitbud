import { NotFoundState } from "../components/StatePanels";
import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../layout/AppShell";
import { OfflineBanner } from "../components/OfflineBanner";

/**
 * Frame 185 — unknown route. When signed in, render inside the shell so the
 * card matches the locked frame (catch-all in App.tsx sits outside RequireAuth).
 */
export function NotFoundPage() {
  const { me, loading } = useAuth();
  const card = (
    <div className="state-card-mount page" data-testid="screen-TW-33">
      <NotFoundState />
    </div>
  );

  if (loading) {
    return (
      <main className="state-card-mount" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (me?.permittedRoles.includes("trainer")) {
    return (
      <AppShell>
        <OfflineBanner />
        {card}
      </AppShell>
    );
  }

  return <main className="state-card-mount">{card}</main>;
}
