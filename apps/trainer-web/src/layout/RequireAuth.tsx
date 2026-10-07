import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "./AppShell";

export function RequireAuth() {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="centered-status" aria-busy="true">
        <p>Loading session…</p>
      </main>
    );
  }

  if (!me) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
