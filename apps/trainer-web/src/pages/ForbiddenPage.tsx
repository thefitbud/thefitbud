import { ForbiddenState } from "../components/StatePanels";
import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../layout/AppShell";
import { OfflineBanner } from "../components/OfflineBanner";

/** TW-33 / frame 187 — no-access surface for another trainer's client. */
export function ForbiddenPage() {
  const { me, loading } = useAuth();
  const card = (
    <div
      className="state-card-mount page"
      data-testid="screen-TW-33-forbidden"
    >
      <ForbiddenState />
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
