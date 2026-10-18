import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  ClipboardCheck,
  HelpCircle,
  Home,
  LayoutGrid,
  MoreHorizontal,
  Search,
  Users,
} from "lucide-react";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { useConfig } from "../lib/config";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { BrandMark } from "../components/BrandMark";

type PaletteHit = {
  relationshipId: string;
  name: string;
  goalShort: string | null;
};

const PAGE_TITLES: Array<{ match: (path: string) => boolean; title: string }> = [
  { match: (p) => p === "/", title: "Home" },
  { match: (p) => p.startsWith("/clients/add"), title: "Add client" },
  { match: (p) => p.startsWith("/clients/"), title: "Client" },
  { match: (p) => p.startsWith("/clients"), title: "Clients" },
  { match: (p) => p.startsWith("/checkins"), title: "Check-ins" },
  { match: (p) => p.startsWith("/templates"), title: "Templates" },
  { match: (p) => p.startsWith("/settings"), title: "More" },
  { match: (p) => p.startsWith("/invitations"), title: "Invitation" },
];

function pageTitleFor(pathname: string): string {
  return PAGE_TITLES.find((row) => row.match(pathname))?.title ?? "FitBud";
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "T"
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "shell-nav-link is-active" : "shell-nav-link";
}

function supportMailto(screenId: string, supportEmail: string): string {
  const subject = encodeURIComponent(
    `FitBud support · Trainer web · ${screenId}`,
  );
  const body = encodeURIComponent(
    `\n\n---\nApp: Trainer web\nScreen: ${screenId}\nLocal time: ${new Date().toISOString()}`,
  );
  return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email, me } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? "tech@thefitbud.com";
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = pageTitleFor(location.pathname);

  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [checkinBadge, setCheckinBadge] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteHits, setPaletteHits] = useState<PaletteHit[]>([]);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellItems, setBellItems] = useState<
    Array<{ id: string; title: string; href: string }>
  >([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const goChordRef = useRef(false);
  const paletteListId = useId();

  const displayName =
    formatPersonName(me?.trainerProfile?.displayName) ||
    formatPersonName(email?.split("@")[0]?.replace(/[._-]+/g, " ")) ||
    "Trainer";

  const loadBadges = useCallback(async () => {
    try {
      const [attention, inbox] = await Promise.all([
        stage1Api.getAttentionGroups(),
        apiClient.listTrainerCheckinInbox(),
      ]);
      const openGroups = attention.groups.filter((g) =>
        g.items.some(
          (i) => i.status === "detected" || i.status === "active",
        ),
      );
      setAttentionCount(openGroups.length);
      const submitted = inbox.items.filter(
        (row) => row.checkin.status === "submitted",
      ).length;
      setCheckinBadge(submitted);
    } catch {
      setAttentionCount(null);
      setCheckinBadge(null);
    }
  }, []);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges, location.pathname]);

  useEffect(() => {
    if (!paletteOpen) return;
    const q = paletteQuery.trim();
    if (q.length < 1) {
      setPaletteHits([]);
      return;
    }
    let cancelled = false;
    const started = performance.now();
    setPaletteLoading(true);
    void apiClient
      .listClients({ q, limit: 12 })
      .then((res) => {
        if (cancelled) return;
        const hits = res.items
          .filter((row) => Boolean(row.relationshipId))
          .map((row) => ({
            relationshipId: row.relationshipId as string,
            name: row.traineeDisplayName,
            goalShort: row.goalShort ?? null,
          }));
        setPaletteHits(hits);
        void started;
      })
      .catch(() => {
        if (!cancelled) setPaletteHits([]);
      })
      .finally(() => {
        if (!cancelled) setPaletteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paletteOpen, paletteQuery]);

  useEffect(() => {
    if (!paletteOpen) return;
    paletteInputRef.current?.focus();
  }, [paletteOpen]);

  useEffect(() => {
    if (!bellOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const asks = (await stage1Api.listCoachAsks({
          status: "open",
        })) as { items: Array<{ id: string; relationshipId: string }> };
        const inbox = await apiClient.listTrainerCheckinInbox();
        if (cancelled) return;
        const items: Array<{ id: string; title: string; href: string }> = [];
        for (const ask of asks.items.slice(0, 5)) {
          items.push({
            id: `ask-${ask.id}`,
            title: "Asked you on WhatsApp",
            href: `/?ask=${ask.id}`,
          });
        }
        for (const row of inbox.items
          .filter((i) => i.checkin.status === "submitted")
          .slice(0, 5)) {
          items.push({
            id: `ci-${row.checkin.id}`,
            title: "Check-in submitted",
            href: `/clients/${row.coachingRelationshipId}/check-ins/${row.checkin.id}`,
          });
        }
        setBellItems(items);
      } catch {
        if (!cancelled) setBellItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bellOpen]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (ev.key === "/" && !typing) {
        ev.preventDefault();
        setPaletteOpen(true);
        setPaletteQuery("");
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        setPaletteOpen(true);
        setPaletteQuery("");
        return;
      }
      if (ev.key === "?" && !typing) {
        ev.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (typing) return;
      if (ev.key.toLowerCase() === "g" && !ev.metaKey && !ev.ctrlKey) {
        goChordRef.current = true;
        window.setTimeout(() => {
          goChordRef.current = false;
        }, 800);
        return;
      }
      if (goChordRef.current) {
        const k = ev.key.toLowerCase();
        goChordRef.current = false;
        if (k === "h") navigate("/");
        if (k === "c") navigate("/clients");
        if (k === "k") navigate("/checkins");
        if (k === "t") navigate("/templates");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  function openPalette(event?: FormEvent) {
    event?.preventDefault();
    setPaletteOpen(true);
    setPaletteQuery("");
  }

  function onPaletteKey(ev: ReactKeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Escape") {
      setPaletteOpen(false);
      return;
    }
    if (ev.key === "Enter" && paletteHits[0]) {
      navigate(`/clients/${paletteHits[0].relationshipId}`);
      setPaletteOpen(false);
    }
  }

  const helpHref = supportMailto("TW-03", supportEmail);

  const navItems = (
    <>
      <NavLink to="/" end className={navClass}>
        <Home size={20} strokeWidth={1.75} aria-hidden />
        <span className="shell-nav-label">Home</span>
        {attentionCount !== null && attentionCount > 0 ? (
          <span className="shell-nav-badge">{attentionCount}</span>
        ) : null}
      </NavLink>
      <NavLink to="/clients" className={navClass}>
        <Users size={20} strokeWidth={1.75} aria-hidden />
        <span className="shell-nav-label">Clients</span>
      </NavLink>
      <NavLink to="/checkins" className={navClass}>
        <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden />
        <span className="shell-nav-label">Check-ins</span>
        {checkinBadge !== null && checkinBadge > 0 ? (
          <span className="shell-nav-badge">{checkinBadge}</span>
        ) : null}
      </NavLink>
      <NavLink to="/templates" className={navClass}>
        <LayoutGrid size={20} strokeWidth={1.75} aria-hidden />
        <span className="shell-nav-label">Templates</span>
      </NavLink>
      <NavLink to="/settings" className={navClass}>
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden />
        <span className="shell-nav-label">More</span>
      </NavLink>
    </>
  );

  return (
    <div className="app-shell" data-testid="screen-TW-03">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="shell-side" aria-label="Primary">
        <div className="shell-brand">
          <BrandMark size={34} variant="inverse" />
          <b>FitBud</b>
        </div>
        <nav className="shell-nav" aria-label="Primary">
          {navItems}
        </nav>
        <div className="shell-side-grow" />
        <div className="shell-side-foot">
          <a className="shell-nav-link shell-help" href={helpHref}>
            <HelpCircle size={20} strokeWidth={1.75} aria-hidden />
            <span className="shell-nav-label">Help</span>
          </a>
          <NavLink to="/settings/profile" className="shell-me">
            <span className="shell-av" aria-hidden>
              {initials(displayName)}
            </span>
            <span className="shell-me-text">
              <b>{displayName}</b>
              <span>Trainer</span>
            </span>
          </NavLink>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-crumb">{pageTitle}</div>
          <button
            type="button"
            className="shell-search"
            onClick={() => openPalette()}
            aria-label="Search clients ⌘K"
          >
            <Search size={16} strokeWidth={1.75} aria-hidden />
            <span>Search clients</span>
            <kbd className="shell-kbd">⌘K</kbd>
          </button>
          <div className="shell-bell-wrap">
            <button
              type="button"
              className="shell-bell"
              aria-label="Notifications"
              aria-expanded={bellOpen}
              onClick={() => setBellOpen((v) => !v)}
            >
              <Bell size={18} strokeWidth={1.75} aria-hidden />
              {bellItems.length > 0 || (attentionCount ?? 0) > 0 ? (
                <span className="shell-bell-dot" aria-hidden />
              ) : null}
            </button>
            {bellOpen ? (
              <div className="shell-bell-popover" role="dialog" aria-label="Notifications">
                {bellItems.length === 0 ? (
                  <p className="muted">No new notifications</p>
                ) : (
                  <ul>
                    {bellItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setBellOpen(false);
                            navigate(item.href);
                          }}
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </header>

        <main id="main" className="page-main">
          {children}
        </main>
      </div>

      <nav className="shell-bottom-nav" aria-label="Primary mobile">
        {navItems}
      </nav>

      {paletteOpen ? (
        <div
          className="shell-palette-backdrop"
          role="presentation"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="shell-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search clients"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shell-palette-input">
              <Search size={18} strokeWidth={1.75} aria-hidden />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={onPaletteKey}
                placeholder="Search clients by name or goal"
                aria-controls={paletteListId}
                aria-autocomplete="list"
              />
            </div>
            <ul id={paletteListId} className="shell-palette-list" role="listbox">
              {paletteLoading ? (
                <li className="muted">Searching…</li>
              ) : null}
              {!paletteLoading &&
              paletteQuery.trim() &&
              paletteHits.length === 0 ? (
                <li className="muted">No clients match</li>
              ) : null}
              {paletteHits.map((hit) => (
                <li key={hit.relationshipId}>
                  <button
                    type="button"
                    role="option"
                    onClick={() => {
                      navigate(`/clients/${hit.relationshipId}`);
                      setPaletteOpen(false);
                    }}
                  >
                    <b>{hit.name}</b>
                    {hit.goalShort ? (
                      <span className="muted">{hit.goalShort}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {helpOpen ? (
        <div
          className="shell-palette-backdrop"
          role="presentation"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="shell-help-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Shortcuts</h2>
            <ul>
              <li>
                <kbd>G</kbd> then <kbd>H</kbd> Home
              </li>
              <li>
                <kbd>G</kbd> then <kbd>C</kbd> Clients
              </li>
              <li>
                <kbd>G</kbd> then <kbd>K</kbd> Check-ins
              </li>
              <li>
                <kbd>G</kbd> then <kbd>T</kbd> Templates
              </li>
              <li>
                <kbd>/</kbd> or <kbd>⌘K</kbd> Search
              </li>
            </ul>
            <p className="muted">We&apos;ll get back to you within a day.</p>
            <a className="button-primary" href={helpHref}>
              Email support
            </a>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
