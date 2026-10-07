import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const { email, me, signOut } = useAuth();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="top-bar">
        <div className="top-bar-brand">
          <span className="brand-mark">FitBud</span>
          <span className="brand-tagline">Progress, guided.</span>
        </div>
        <nav className="primary-nav" aria-label="Primary">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/clients" className={navClass}>
            Clients
          </NavLink>
          <NavLink to="/checkins" className={navClass}>
            Check-ins
          </NavLink>
          <NavLink to="/templates" className={navClass}>
            Templates
          </NavLink>
        </nav>
        <div className="top-bar-meta">
          <span className="session-label">
            {email ?? me?.firebaseUid ?? "Trainer"}
          </span>
          <button
            type="button"
            className="button-ghost"
            aria-label="Sign out of FitBud"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="page-main">
        {children}
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link is-active" : "nav-link";
}
