import {
  Link,
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
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  Dumbbell,
  HelpCircle,
  Home,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  Search,
  Settings,
  Smartphone,
  User,
  Users,
} from "lucide-react";
import {
  formatLocalDate,
  formatPersonName,
  labelFor,
  trainerNotificationCopy,
} from "@fitbud/core";
import { logEditBellItems } from "./bellItems";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { useConfig } from "../lib/config";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { LogoLockup } from "../components/ui/LogoLockup";
import {
  getShellClientTitle,
  subscribeShellClientTitle,
} from "../lib/shell-title";
import "./AppShell.css";

type PaletteClientHit = {
  kind: "client";
  id: string;
  name: string;
  meta: string;
  href: string;
};

type PaletteTemplateHit = {
  kind: "template";
  id: string;
  name: string;
  meta: string;
  href: string;
  icon: "exercise" | "plan" | "users";
};

type PalettePageHit = {
  kind: "page";
  id: string;
  name: string;
  meta: string;
  href: string;
};

type PaletteHit = PaletteClientHit | PaletteTemplateHit | PalettePageHit;

const PALETTE_PAGES: Array<Omit<PalettePageHit, "kind">> = [
  { id: "page-home", name: "Home", meta: "Dashboard", href: "/" },
  { id: "page-clients", name: "Clients", meta: "Roster", href: "/clients" },
  {
    id: "page-clients-ended",
    name: "Clients · Ended",
    meta: "Roster",
    href: "/clients?segment=ended",
  },
  {
    id: "page-checkins",
    name: "Check-ins",
    meta: "Inbox",
    href: "/checkins",
  },
  {
    id: "page-templates",
    name: "Templates",
    meta: "Hub",
    href: "/templates",
  },
  {
    id: "page-exercises",
    name: "Exercises",
    meta: "Libraries",
    href: "/templates/libraries/exercises",
  },
  {
    id: "page-foods",
    name: "Foods",
    meta: "Libraries",
    href: "/templates/libraries/foods",
  },
  {
    id: "page-add-client",
    name: "Add client",
    meta: "Clients",
    href: "/clients/add",
  },
  {
    id: "page-library",
    name: "Library",
    meta: "Exercises and foods",
    href: "/templates/libraries/exercises",
  },
  {
    id: "page-settings",
    name: "Settings",
    meta: "Account",
    href: "/settings",
  },
  {
    id: "page-help",
    name: "Help",
    meta: "Support",
    href: "/settings/help",
  },
];

/** Word-prefix match so "ro" hits Rohan / Roller / Roster, not Crossover. */
function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const h = haystack.toLowerCase();
  if (h.startsWith(q)) return true;
  return h.split(/[^a-z0-9]+/).some((word) => word.startsWith(q));
}

function clientPaletteMeta(row: ClientDirectoryItem): string {
  const parts: string[] = [];
  if (row.adherenceState === "needs_attention") {
    parts.push(labelFor("adherence_state", row.adherenceState));
  } else {
    parts.push(labelFor("onboarding_status", row.status));
  }
  if (row.goalShort?.trim()) parts.push(row.goalShort.trim());
  if (row.effectivePlan?.title?.trim()) {
    parts.push(row.effectivePlan.title.trim());
  }
  return parts.join(" · ");
}

function ownershipLabel(ownership: "global" | "trainer"): string {
  return ownership === "global" ? "FitBud base" : "Mine";
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % 8;
  }
  return `shell-palette-av-c${(hash % 8) + 1}`;
}

const PAGE_TITLES: Array<{ match: (path: string) => boolean; title: string }> = [
  { match: (p) => p === "/", title: "Home" },
  { match: (p) => p.startsWith("/clients/add"), title: "Add client" },
  { match: (p) => p.startsWith("/clients/"), title: "Clients" },
  { match: (p) => p.startsWith("/clients"), title: "Clients" },
  { match: (p) => p.startsWith("/checkins"), title: "Check-ins" },
  { match: (p) => p.startsWith("/templates/libraries"), title: "Library" },
  { match: (p) => p.startsWith("/templates"), title: "Templates" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
  { match: (p) => p.startsWith("/invitations"), title: "Invitation" },
];

function pageTitleFor(pathname: string, clientTitle: string | null): string {
  if (pathname.startsWith("/clients/") && !pathname.startsWith("/clients/add")) {
    return clientTitle?.trim() || "Clients";
  }
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
  const { email, me, signOut } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? "tech@thefitbud.com";
  const navigate = useNavigate();
  const location = useLocation();
  const clientTitle = useSyncExternalStore(
    subscribeShellClientTitle,
    getShellClientTitle,
    getShellClientTitle,
  );
  const pageTitle = pageTitleFor(location.pathname, clientTitle);

  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [checkinBadge, setCheckinBadge] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteClients, setPaletteClients] = useState<PaletteClientHit[]>([]);
  const [paletteTemplates, setPaletteTemplates] = useState<PaletteTemplateHit[]>(
    [],
  );
  const [palettePages, setPalettePages] = useState<PalettePageHit[]>([]);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellItems, setBellItems] = useState<
    Array<{ id: string; title: string; href: string }>
  >([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
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
    setNavOpen(false);
    setAcctOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!acctOpen) return;
    function onPointer(ev: PointerEvent) {
      if (!acctRef.current?.contains(ev.target as Node)) setAcctOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setAcctOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const q = paletteQuery.trim();
    if (q.length < 1) {
      setPaletteClients([]);
      setPaletteTemplates([]);
      setPalettePages([]);
      setPaletteIndex(0);
      setPaletteLoading(false);
      return;
    }
    let cancelled = false;
    setPaletteLoading(true);
    setPaletteIndex(0);

    const pages = PALETTE_PAGES.filter(
      (page) =>
        matchesQuery(page.name, q) || matchesQuery(page.meta, q),
    ).map((page) => ({ ...page, kind: "page" as const }));
    setPalettePages(pages);

    void Promise.all([
      apiClient.listClients({ q, limit: 12 }).catch(() => ({ items: [] })),
      apiClient
        .listPlanTemplates({ q, limit: 12, scope: "all" })
        .catch(() => ({ items: [] })),
      apiClient
        .listExerciseLibrary({ q, limit: 24 })
        .catch(() => ({ items: [] })),
    ])
      .then(([clients, plans, exercises]) => {
        if (cancelled) return;
        const clientHits: PaletteClientHit[] = clients.items
          .filter(
            (row) =>
              Boolean(row.relationshipId) &&
              (matchesQuery(row.traineeDisplayName, q) ||
                matchesQuery(row.goalShort ?? "", q) ||
                matchesQuery(row.effectivePlan?.title ?? "", q)),
          )
          .slice(0, 6)
          .map((row) => ({
            kind: "client",
            id: row.relationshipId as string,
            name: formatPersonName(row.traineeDisplayName),
            meta: clientPaletteMeta(row),
            href: `/clients/${row.relationshipId}`,
          }));
        const planHits: PaletteTemplateHit[] = plans.items
          .filter((row) => matchesQuery(row.title, q))
          .slice(0, 4)
          .map((row) => {
            const hub =
              row.templateType === "nutrition"
                ? "diets"
                : row.templateType === "combined"
                  ? "full-plans"
                  : "workouts";
            return {
              kind: "template" as const,
              id: `plan-${row.id}`,
              name: row.title,
              meta: `${labelFor("plan_template_type", row.templateType)} · ${ownershipLabel(row.ownership)}`,
              href: `/templates/${hub}/${row.id}`,
              icon: "plan" as const,
            };
          });
        const qLower = q.toLowerCase();
        const exerciseHits: PaletteTemplateHit[] = exercises.items
          .filter((row) => matchesQuery(row.name, q))
          .sort((a, b) => {
            const aStarts = a.name.toLowerCase().startsWith(qLower) ? 0 : 1;
            const bStarts = b.name.toLowerCase().startsWith(qLower) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return a.name.localeCompare(b.name);
          })
          .slice(0, 2)
          .map((row) => ({
            kind: "template" as const,
            id: `ex-${row.id}`,
            name: row.name,
            meta: `Exercise · ${ownershipLabel(row.ownership)}`,
            href: "/templates/libraries/exercises",
            icon: "exercise" as const,
          }));
        setPaletteClients(clientHits);
        setPaletteTemplates([...exerciseHits, ...planHits].slice(0, 5));
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
        const [asks, inbox, directory, notifications] = await Promise.all([
          stage1Api.listCoachAsks({
            status: "open",
          }) as Promise<{ items: Array<{ id: string; relationshipId: string }> }>,
          apiClient.listTrainerCheckinInbox(),
          apiClient.listClients({ limit: 100 }).catch(() => ({ items: [] })),
          // Z14-16: a client's meal-log changes. Without them the bell still
          // shows asks and check-ins (Activity keeps the Edited/Removed rows).
          apiClient.listNotifications().catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const names = new Map<string, string>();
        for (const client of directory.items) {
          if (client.relationshipId && client.traineeDisplayName.trim()) {
            names.set(client.relationshipId, client.traineeDisplayName);
          }
        }
        const items: Array<{ id: string; title: string; href: string }> = [];
        for (const ask of asks.items.slice(0, 5)) {
          items.push({
            id: `ask-${ask.id}`,
            title: trainerNotificationCopy(
              "trainer_ask_coach",
              names.get(ask.relationshipId),
            ).title,
            href: `/?ask=${ask.id}`,
          });
        }
        for (const row of inbox.items
          .filter((i) => i.checkin.status === "submitted")
          .slice(0, 5)) {
          items.push({
            id: `ci-${row.checkin.id}`,
            title: trainerNotificationCopy(
              "trainer_checkin_submitted",
              names.get(row.coachingRelationshipId) ?? row.traineeDisplayName,
            ).title,
            href: `/clients/${row.coachingRelationshipId}/check-ins/${row.checkin.id}`,
          });
        }
        const trainerZone =
          me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
        items.push(
          ...logEditBellItems(
            notifications.items,
            names,
            formatLocalDate(new Date(), trainerZone),
          ),
        );
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
        if (k === "l") navigate("/templates/libraries/exercises");
        if (k === "s") navigate("/settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const paletteFlat: PaletteHit[] = [
    ...paletteClients,
    ...paletteTemplates,
    ...palettePages,
  ];
  const activeHit = paletteFlat[paletteIndex] ?? null;

  function openPalette(event?: FormEvent) {
    event?.preventDefault();
    setPaletteOpen(true);
    setPaletteQuery("");
    setPaletteIndex(0);
  }

  function closePalette() {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
  }

  function openPaletteHit(hit: PaletteHit) {
    navigate(hit.href);
    closePalette();
  }

  function onPaletteKey(ev: ReactKeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Escape") {
      closePalette();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (paletteFlat.length === 0) return;
      setPaletteIndex((i) => (i + 1) % paletteFlat.length);
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (paletteFlat.length === 0) return;
      setPaletteIndex((i) => (i - 1 + paletteFlat.length) % paletteFlat.length);
      return;
    }
    if (ev.key === "Enter" && activeHit) {
      ev.preventDefault();
      openPaletteHit(activeHit);
    }
  }

  const helpHref = supportMailto("TW-03", supportEmail);
  const onLibrary = location.pathname.startsWith("/templates/libraries");
  const onTemplates = location.pathname.startsWith("/templates") && !onLibrary;
  const onHelp = location.pathname.startsWith("/settings/help");
  const onSettings = location.pathname.startsWith("/settings") && !onHelp;
  const settingsCrumb = (
    [
      ["/settings/notifications", "Notifications"],
      ["/settings/business", "Business and packages"],
      ["/settings/units", "Units and language"],
      ["/settings/ended", "Ended clients"],
      ["/settings/privacy", "Privacy and data"],
      ["/settings/help", "Help"],
    ] as const
  ).find(([path]) => location.pathname.startsWith(path))?.[1];

  function primaryLinks(withTestId: boolean) {
    const item = (
      to: string,
      label: string,
      icon: ReactNode,
      active: boolean,
      testId: string,
      badge?: number | null,
    ) => (
      <Link
        key={to}
        to={to}
        className={active ? "shell-nav-link is-active" : "shell-nav-link"}
        aria-current={active ? "page" : undefined}
        aria-label={badge && badge > 0 ? `${label}, ${badge}` : label}
        title={label}
        data-testid={withTestId ? testId : undefined}
        onClick={() => setNavOpen(false)}
      >
        {icon}
        <span className="shell-nav-label">{label}</span>
        {badge !== null && badge !== undefined && badge > 0 ? (
          <span className="shell-nav-badge">{badge}</span>
        ) : null}
      </Link>
    );
    return (
      <>
        {item("/", "Home", <Home size={20} strokeWidth={1.75} aria-hidden />, location.pathname === "/", "nav-home", attentionCount)}
        {item("/clients", "Clients", <Users size={20} strokeWidth={1.75} aria-hidden />, location.pathname.startsWith("/clients"), "nav-clients")}
        {item("/checkins", "Check-ins", <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden />, location.pathname.startsWith("/checkins"), "nav-checkins", checkinBadge)}
        {item("/templates", "Templates", <LayoutGrid size={20} strokeWidth={1.75} aria-hidden />, onTemplates, "nav-templates")}
        {item("/templates/libraries/exercises", "Library", <Library size={20} strokeWidth={1.75} aria-hidden />, onLibrary, "nav-library")}
      </>
    );
  }

  const crumb = location.pathname.startsWith("/clients/add") ? (
      <>
        <NavLink to="/clients" className="shell-crumb-link">
          Clients
        </NavLink>
        <ChevronRight size={14} aria-hidden />
        <b>Add client</b>
      </>
    ) : location.pathname.startsWith("/settings") ? (
      settingsCrumb ? (
        <>
          <NavLink to="/settings" className="shell-crumb-link">
            Settings
          </NavLink>
          <ChevronRight size={14} aria-hidden />
          <b>{settingsCrumb}</b>
        </>
      ) : (
        <b>Settings</b>
      )
    ) : (
      <b>{pageTitle}</b>
    );

  return (
    <div
      className={`app-shell${navOpen ? " is-nav-open" : ""}`}
      data-testid="screen-TW-03"
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {navOpen ? (
        <button
          type="button"
          className="shell-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className="shell-side" aria-label="Primary" id="shell-side-nav">
        <div className="shell-brand">
          <LogoLockup />
        </div>
        <nav className="shell-nav" aria-label="Primary">
          {primaryLinks(true)}
        </nav>
        <div className="shell-side-grow" />
        <div className="shell-side-foot">
          <Link
            to="/settings/help"
            className={onHelp ? "shell-nav-link is-active" : "shell-nav-link"}
            aria-current={onHelp ? "page" : undefined}
            aria-label="Help"
            title="Help"
            data-testid="nav-help"
            onClick={() => setNavOpen(false)}
          >
            <HelpCircle size={20} strokeWidth={1.75} aria-hidden />
            <span className="shell-nav-label">Help</span>
          </Link>
          <Link
            to="/settings"
            className={onSettings ? "shell-nav-link is-active" : "shell-nav-link"}
            aria-current={onSettings ? "page" : undefined}
            aria-label="Settings"
            title="Settings"
            data-testid="nav-settings"
            onClick={() => setNavOpen(false)}
          >
            <Settings size={20} strokeWidth={1.75} aria-hidden />
            <span className="shell-nav-label">Settings</span>
          </Link>
          <div className="shell-acct-wrap" ref={acctRef}>
            {acctOpen ? (
              <div
                className="shell-acct-menu"
                role="menu"
                aria-label="Account"
                data-testid="account-menu"
              >
                <div className="shell-acct-menu-who">
                  <span className="shell-av" aria-hidden>
                    {initials(displayName)}
                  </span>
                  <span>
                    <b>{displayName}</b>
                    <span>{me?.email ?? email}</span>
                  </span>
                </div>
                <Link role="menuitem" className="shell-menu-item" to="/settings/profile" onClick={() => setAcctOpen(false)}>
                  <User size={16} aria-hidden />
                  Profile
                </Link>
                <Link
                  role="menuitem"
                  className={onSettings ? "shell-menu-item is-on" : "shell-menu-item"}
                  to="/settings"
                  onClick={() => setAcctOpen(false)}
                >
                  <Settings size={16} aria-hidden />
                  Settings
                </Link>
                <a
                  role="menuitem"
                  className="shell-menu-item"
                  href="https://apps.apple.com/app/fitbud"
                  data-testid="account-coach-app"
                >
                  <Smartphone size={16} aria-hidden />
                  Get the coach app
                </a>
                <button
                  type="button"
                  role="menuitem"
                  className="shell-menu-item is-signout"
                  data-testid="account-sign-out"
                  onClick={() => {
                    setAcctOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut size={16} aria-hidden />
                  Sign out
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="shell-acct"
              aria-haspopup="menu"
              aria-expanded={acctOpen}
              aria-label={`${displayName}, Coach`}
              data-testid="account-menu-button"
              onClick={() => setAcctOpen((open) => !open)}
            >
              <span className="shell-av" aria-hidden>
                {initials(displayName)}
              </span>
              <span className="shell-acct-who">
                <b>{displayName}</b>
                <span>Coach</span>
              </span>
              <ChevronsUpDown className="shell-acct-chev" size={16} aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <button
            type="button"
            className="shell-menu-btn"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="shell-side-nav"
            onClick={() => setNavOpen((v) => !v)}
            data-testid="shell-menu-btn"
          >
            <Menu size={22} strokeWidth={1.75} aria-hidden />
          </button>
          <div className="shell-crumb">{crumb}</div>
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

        <main id="main" className="page-main main">
          {children}
        </main>
      </div>

      <nav className="shell-bottom-nav" aria-label="Primary mobile">
        {primaryLinks(false)}
      </nav>

      {paletteOpen ? (
        <div
          className="shell-palette-backdrop"
          role="presentation"
          onClick={closePalette}
        >
          <div
            className="shell-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            data-testid="shell-search-palette"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shell-palette-input">
              <Search size={18} strokeWidth={1.75} aria-hidden />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={onPaletteKey}
                placeholder="Search clients, templates, pages"
                aria-controls={paletteListId}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeHit ? `palette-opt-${activeHit.id}` : undefined
                }
              />
              <kbd className="shell-palette-esc">esc</kbd>
            </div>
            <div id={paletteListId} className="shell-palette-results" role="listbox">
              {paletteLoading ? (
                <p className="shell-palette-empty muted">Searching…</p>
              ) : null}
              {!paletteLoading &&
              paletteQuery.trim() &&
              paletteFlat.length === 0 ? (
                <p className="shell-palette-empty muted">No matches</p>
              ) : null}
              {!paletteLoading && paletteClients.length > 0 ? (
                <section className="shell-palette-group" aria-label="Clients">
                  <h2 className="shell-palette-group-label">Clients</h2>
                  <ul className="shell-palette-list">
                    {paletteClients.map((hit) => {
                      const flatIndex = paletteFlat.findIndex(
                        (row) => row.id === hit.id,
                      );
                      const selected = flatIndex === paletteIndex;
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            id={`palette-opt-${hit.id}`}
                            role="option"
                            aria-selected={selected}
                            className={
                              selected
                                ? "shell-palette-row is-active"
                                : "shell-palette-row"
                            }
                            onMouseEnter={() => setPaletteIndex(flatIndex)}
                            onClick={() => openPaletteHit(hit)}
                          >
                            <span
                              className={`shell-palette-av ${avatarTone(hit.name)}`}
                              aria-hidden
                            >
                              {initials(hit.name)}
                            </span>
                            <span className="shell-palette-row-text">
                              <b>{hit.name}</b>
                              {hit.meta ? (
                                <span className="muted">{hit.meta}</span>
                              ) : null}
                            </span>
                            {selected ? (
                              <span className="shell-palette-enter">
                                Enter to open
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {!paletteLoading && paletteTemplates.length > 0 ? (
                <section className="shell-palette-group" aria-label="Templates">
                  <h2 className="shell-palette-group-label">Templates</h2>
                  <ul className="shell-palette-list">
                    {paletteTemplates.map((hit) => {
                      const flatIndex = paletteFlat.findIndex(
                        (row) => row.id === hit.id,
                      );
                      const selected = flatIndex === paletteIndex;
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            id={`palette-opt-${hit.id}`}
                            role="option"
                            aria-selected={selected}
                            className={
                              selected
                                ? "shell-palette-row is-active"
                                : "shell-palette-row"
                            }
                            onMouseEnter={() => setPaletteIndex(flatIndex)}
                            onClick={() => openPaletteHit(hit)}
                          >
                            <span className="shell-palette-icon" aria-hidden>
                              {hit.icon === "exercise" ? (
                                <Dumbbell size={18} strokeWidth={1.75} />
                              ) : (
                                <LayoutGrid size={18} strokeWidth={1.75} />
                              )}
                            </span>
                            <span className="shell-palette-row-text">
                              <b>{hit.name}</b>
                              <span className="muted">{hit.meta}</span>
                            </span>
                            {selected ? (
                              <span className="shell-palette-enter">
                                Enter to open
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {!paletteLoading && palettePages.length > 0 ? (
                <section className="shell-palette-group" aria-label="Pages">
                  <h2 className="shell-palette-group-label">Pages</h2>
                  <ul className="shell-palette-list">
                    {palettePages.map((hit) => {
                      const flatIndex = paletteFlat.findIndex(
                        (row) => row.id === hit.id,
                      );
                      const selected = flatIndex === paletteIndex;
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            id={`palette-opt-${hit.id}`}
                            role="option"
                            aria-selected={selected}
                            className={
                              selected
                                ? "shell-palette-row is-active"
                                : "shell-palette-row"
                            }
                            onMouseEnter={() => setPaletteIndex(flatIndex)}
                            onClick={() => openPaletteHit(hit)}
                          >
                            <span className="shell-palette-icon" aria-hidden>
                              <Users size={18} strokeWidth={1.75} />
                            </span>
                            <span className="shell-palette-row-text">
                              <b>{hit.name}</b>
                              <span className="muted">{hit.meta}</span>
                            </span>
                            {selected ? (
                              <span className="shell-palette-enter">
                                Enter to open
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
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
                <kbd>G</kbd> then <kbd>L</kbd> Library
              </li>
              <li>
                <kbd>G</kbd> then <kbd>S</kbd> Settings
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
