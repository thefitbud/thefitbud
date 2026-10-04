import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent, type ReactNode, type SVGProps } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [attentionCount, setAttentionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [relationships, invitations, attention] = await Promise.all([
          apiClient.listRelationships({ limit: 50 }),
          apiClient.listInvitations(),
          apiClient.getAttentionFeed({ limit: 50 }),
        ]);
        if (cancelled) return;
        const pendingInvites = invitations.items.filter(
          (item) => item.status === "pending",
        ).length;
        setClientCount(relationships.items.length + pendingInvites);
        setAttentionCount(attention.items.length);
      } catch {
        if (!cancelled) {
          setClientCount(null);
          setAttentionCount(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    navigate(next ? `/clients?q=${encodeURIComponent(next)}` : "/clients");
  }

  const displayName = trainerName(email);
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="side-nav">
        <div className="brand-lockup">
          <span className="brand-glyph" aria-hidden="true">
            <IconBolt />
          </span>
          <span className="brand-copy">
            <span className="brand-mark">FitBud Coach</span>
            <span className="brand-tagline">
              <span className="live-dot" aria-hidden="true" />
              Active Coaching
            </span>
          </span>
        </div>
        <p className="nav-kicker">Menu</p>
        <nav className="primary-nav" aria-label="Primary">
          <NavLink to="/" end className={navClass}>
            <IconHome />
            <span className="nav-label">Home</span>
            {attentionCount !== null && attentionCount > 0 ? (
              <span className="nav-alert" aria-label={`${attentionCount} need attention`}>
                {attentionCount}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/clients" className={navClass}>
            <IconClients />
            <span className="nav-label">Clients</span>
            {clientCount !== null ? (
              <span className="nav-count">{clientCount}</span>
            ) : null}
          </NavLink>
          <NavLink to="/templates" className={navClass}>
            <IconTemplates />
            <span className="nav-label">Templates & Libraries</span>
          </NavLink>
          <NavLink to="/checkins" className={navClass} aria-label="Check-ins">
            <IconCheckins />
            <span className="nav-label">Check-ins</span>
          </NavLink>
        </nav>
        <div className="side-nav-footer">
          <p className="nav-help">
            <span className="nav-help-icon" aria-hidden="true">
              <IconHelp />
            </span>
            Help & Support
          </p>
          <div className="trainer-card">
            <span className="avatar" aria-hidden="true">
              {initials(displayName)}
            </span>
            <span className="trainer-card-copy">
              <span className="trainer-card-name">{displayName}</span>
              <span className="trainer-card-role">Trainer</span>
            </span>
            <button
              type="button"
              className="trainer-signout"
              aria-label="Sign out of FitBud"
              onClick={() => {
                void signOut();
              }}
            >
              <IconSignOut />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-canvas">
        <header className="canvas-top">
          <form className="canvas-search" onSubmit={onSearch}>
            <IconSearch />
            <label className="sr-only" htmlFor="global-search">
              Search clients
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="Search clients, tasks, exceptions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd className="search-kbd">⌘K</kbd>
          </form>
          <time className="canvas-date" dateTime={new Date().toISOString().slice(0, 10)}>
            <IconCalendar />
            {today}
          </time>
          <a className="canvas-bell" href="#attention-heading" aria-label="Needs attention">
            <IconBell />
            {attentionCount !== null && attentionCount > 0 ? (
              <span className="bell-count">{attentionCount}</span>
            ) : null}
          </a>
        </header>
        <main id="main" className="page-main">
          {children}
        </main>
      </div>
    </div>
  );
}

function trainerName(email: string | null): string {
  const local = email?.split("@")[0]?.trim();
  if (!local) return "Trainer";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "T";
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link is-active" : "nav-link";
}

function iconProps(): SVGProps<SVGSVGElement> {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };
}

function IconBolt() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" strokeLinecap="round" />
      <path d="M10 21a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg {...iconProps()}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconClients() {
  return (
    <svg {...iconProps()}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a3 3 0 0 1 0 5.75" />
    </svg>
  );
}

function IconCheckins() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconTemplates() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.4-1.4.9-1.4 1.7V14" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <path d="M9 6V4a2 2 0 0 1 2-2h7v20h-7a2 2 0 0 1-2-2v-2" />
      <path d="M15 12H3m0 0 3-3m-3 3 3 3" />
    </svg>
  );
}
