import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Link,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import { formatRelative } from "@fitbud/core";
import { ErrorState, errorKindFromFailure } from "../../components/StatePanels";
import type { ErrorKind } from "../../components/StatePanels";
import { StatusChip } from "../../components/StatusChip";
import { apiClient } from "../../lib/api";
import {
  issueLine,
  type AttentionGroup,
  type AttentionItem,
} from "../../lib/attentionIssueLine";
import { stage1Api } from "../../lib/stage1-api";
import { useRealtimeHints } from "../../realtime/useRealtimeHints";
import "./home-views.css";

type Severity = AttentionItem["severity"];
type Filter = "all" | Severity;

type Row = {
  group: AttentionGroup;
  primary: AttentionItem;
  severity: Severity;
  ageMinutes: number;
};

type LoadError = { message: string; requestId: string | null; kind: ErrorKind };

/** Poll while the tab is visible, the same cadence as Home. */
const POLL_MS = 45_000;

const SEVERITY_ORDER: Severity[] = ["critical", "attention"];
const SEVERITY_HEADING: Record<Severity, string> = {
  critical: "Critical",
  attention: "Attention",
};

function isOpen(item: AttentionItem): boolean {
  return item.status === "detected" || item.status === "active";
}

function severityRank(severity: Severity): number {
  return severity === "critical" ? 0 : 1;
}

/** The row's lead item: most severe open item, then the oldest. Same as Home. */
function toRow(group: AttentionGroup): Row | null {
  const open = group.items.filter(isOpen);
  if (open.length === 0) return null;
  const primary = [...open].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return b.ageMinutes - a.ageMinutes;
  })[0]!;
  return {
    group,
    primary,
    severity: primary.severity,
    ageMinutes: Math.max(...open.map((i) => i.ageMinutes)),
  };
}

/** "since 12 min", "since 3 h", "since 2 d". */
export function formatSince(ageMinutes: number): string {
  if (ageMinutes < 60) return `since ${Math.max(0, ageMinutes)} min`;
  if (ageMinutes < 24 * 60) return `since ${Math.round(ageMinutes / 60)} h`;
  return `since ${Math.round(ageMinutes / (24 * 60))} d`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function avatarTone(name: string): number {
  const n = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return (n % 8) + 1;
}

function loadErrorFrom(err: unknown): LoadError {
  if (err instanceof ApiClientError) {
    return {
      message: err.message,
      requestId: err.requestId ?? null,
      kind: errorKindFromFailure({
        status: err.status,
        code: err.code,
        message: err.message,
      }),
    };
  }
  return {
    message: "Could not load needs attention.",
    requestId: null,
    kind: "server",
  };
}

/**
 * Home's scroll position when the trainer opened this view from Home, or null
 * when they arrived another way (deep link, another page). Module state so a
 * return from a client panel (history Back) still knows the way home.
 */
let homeOrigin: { scrollY: number } | null = null;

/** Read during render, before Home's DOM is replaced by this page. */
function captureHomeOrigin(navigationType: string): void {
  if (navigationType === "POP") return;
  const fromHome =
    document.querySelector('[data-testid="screen-TW-04"]') !== null;
  homeOrigin = fromHome ? { scrollY: window.scrollY } : null;
}

/**
 * Home loads its sections after it mounts, so the browser's own restore lands
 * on a short page. Re-apply the saved position once the page is tall enough;
 * give up if the trainer scrolls first or after a few seconds.
 */
function restoreScroll(y: number): void {
  if (y <= 0) return;
  const deadline = Date.now() + 4_000;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  for (const name of events) window.addEventListener(name, cancel, { once: true, passive: true });
  const cleanup = () => {
    for (const name of events) window.removeEventListener(name, cancel);
  };
  const tick = () => {
    if (cancelled || Date.now() > deadline) {
      cleanup();
      return;
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y && document.querySelector('[data-testid="screen-TW-04"]')) {
      window.scrollTo(0, y);
      cleanup();
      return;
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

/**
 * D13 full view: every client with an open coaching item, grouped by
 * severity (DS1). A row opens that client's panel on Home (D-W7-2).
 */
export function AttentionViewPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  useState(() => captureHomeOrigin(navigationType));
  const [params, setParams] = useSearchParams();
  const filterParam = params.get("severity");
  const filter: Filter =
    filterParam === "critical" || filterParam === "attention"
      ? filterParam
      : "all";

  const [groups, setGroups] = useState<AttentionGroup[] | null>(null);
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) setError(null);
    try {
      const res = await stage1Api.getAttentionGroups();
      loadedRef.current = true;
      setGroups(res.groups);
      setRefreshError(false);
      setError(null);
    } catch (err) {
      // A failed refresh keeps the rows on screen; only a first load fails loud.
      if (loadedRef.current) {
        if (!quiet) setRefreshError(true);
        return;
      }
      setError(loadErrorFrom(err));
    }
  }, []);

  const loadActiveCount = useCallback(async () => {
    try {
      const res = await apiClient.listClients({ status: ["active"], limit: 1 });
      const count = res.facets?.status?.active;
      setActiveClients(typeof count === "number" ? count : null);
    } catch {
      // The empty state falls back to copy without a number.
      setActiveClients(null);
    }
  }, []);

  useEffect(() => {
    // A fresh visit starts at the top; Back/Forward keeps the browser's place.
    if (navigationType === "PUSH") window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    void load();
    let timer: number | null = null;
    const start = () => {
      if (timer != null) window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!document.hidden) void load({ quiet: true });
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer != null) window.clearInterval(timer);
        timer = null;
        return;
      }
      void load({ quiet: true });
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const rows = useMemo(() => {
    if (!groups) return [];
    return groups
      .map(toRow)
      .filter((row): row is Row => row !== null)
      .sort((a, b) => {
        const sev = severityRank(a.severity) - severityRank(b.severity);
        if (sev !== 0) return sev;
        if (a.ageMinutes !== b.ageMinutes) return b.ageMinutes - a.ageMinutes;
        return a.group.traineeDisplayName.localeCompare(
          b.group.traineeDisplayName,
        );
      });
  }, [groups]);

  // The count only appears in the empty state; fetch it only then.
  const isEmpty = groups !== null && rows.length === 0;
  useEffect(() => {
    if (isEmpty) void loadActiveCount();
  }, [isEmpty, loadActiveCount]);

  const relationshipIds = useMemo(
    () => (groups ?? []).map((g) => g.relationshipId),
    [groups],
  );
  useRealtimeHints(apiClient, relationshipIds, () => {
    void load({ quiet: true });
  });

  const counts = useMemo(
    () => ({
      all: rows.length,
      critical: rows.filter((r) => r.severity === "critical").length,
      attention: rows.filter((r) => r.severity === "attention").length,
    }),
    [rows],
  );

  const sections = SEVERITY_ORDER.filter(
    (sev) => filter === "all" || filter === sev,
  )
    .map((sev) => ({
      severity: sev,
      rows: rows.filter((r) => r.severity === sev),
    }))
    .filter((s) => s.rows.length > 0);

  function setFilter(next: Filter) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("severity");
        else p.set("severity", next);
        return p;
      },
      { replace: true },
    );
  }

  function goHome(ev: ReactMouseEvent<HTMLAnchorElement>) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    const origin = homeOrigin;
    if (!origin) return; // Not opened from Home: the link pushes a fresh Home.
    // Pop back to the Home entry the trainer came from and put its scroll back.
    ev.preventDefault();
    homeOrigin = null;
    navigate(-1);
    restoreScroll(origin.scrollY);
  }

  const loading = groups === null && !error;
  const empty = isEmpty;

  return (
    <div className="hv-page" data-testid="screen-home-attention">
      <Link className="hv-back" to="/" onClick={goHome}>
        <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        Home
      </Link>

      <header className="hv-hdr">
        <div className="hv-hdr-main">
          <h1 className="hv-title">
            Needs attention
            {groups !== null ? (
              <span className="hv-count" aria-label={`${counts.all} clients`}>
                {counts.all}
              </span>
            ) : null}
          </h1>
          <p className="hv-sub">
            {empty
              ? "Every client with an open item, most urgent first."
              : "Every client with an open item, most urgent first. Click a row to review it."}
          </p>
        </div>
        {!empty && !error ? (
          <span className="hv-sort">Sorted by severity, then age</span>
        ) : null}
      </header>

      {error ? (
        <ErrorState
          title="Couldn't load needs attention"
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      ) : null}

      {loading ? (
        <div className="hv-card" aria-busy="true" aria-label="Loading needs attention">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="hv-row hv-row-skel">
              <span className="hv-skel hv-skel-av" />
              <span className="hv-skel hv-skel-line" />
            </div>
          ))}
        </div>
      ) : null}

      {empty ? (
        <section className="hv-card hv-empty" aria-labelledby="hv-empty-title">
          <span className="hv-empty-ic" aria-hidden>
            <Check size={28} strokeWidth={2} />
          </span>
          <h2 id="hv-empty-title">No one needs you right now</h2>
          <p>
            {activeClients !== null && activeClients > 0
              ? `All ${activeClients} active ${activeClients === 1 ? "client is" : "clients are"} on track. `
              : "Your active clients are on track. "}
            New missed workouts, meals and overdue check-ins show up here.
          </p>
          <Link className="hv-btn" to="/" onClick={goHome}>
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            Back to Home
          </Link>
        </section>
      ) : null}

      {groups !== null && rows.length > 0 ? (
        <>
          <div className="hv-filters" role="group" aria-label="Filter by severity">
            {(["all", "critical", "attention"] as const).map((key) => {
              const n = counts[key];
              if (key !== "all" && n === 0) return null;
              const label = key === "all" ? "All" : SEVERITY_HEADING[key];
              return (
                <button
                  key={key}
                  type="button"
                  className="hv-chip"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} <span className="hv-num">{n}</span>
                </button>
              );
            })}
          </div>

          {refreshError ? (
            <p className="form-error" role="alert">
              Couldn&apos;t refresh needs attention ·{" "}
              <button type="button" className="text-link" onClick={() => void load()}>
                Retry
              </button>
            </p>
          ) : null}

          <div className="hv-card">
            {sections.map((section) => (
              <section
                key={section.severity}
                aria-labelledby={`hv-sec-${section.severity}`}
              >
                <h2 className="hv-sec" id={`hv-sec-${section.severity}`}>
                  {SEVERITY_HEADING[section.severity]} ·{" "}
                  <span className="hv-num">{section.rows.length}</span>
                </h2>
                <ul className="hv-list">
                  {section.rows.map((row) => {
                    const { group, primary } = row;
                    const issue = issueLine(group, primary);
                    const since = formatSince(row.ageMinutes);
                    const opened = formatRelative(
                      new Date(Date.now() - row.ageMinutes * 60_000).toISOString(),
                    );
                    return (
                      <li key={group.relationshipId}>
                        <Link
                          className="hv-row"
                          to={`/?client=${encodeURIComponent(group.relationshipId)}`}
                          aria-label={`${group.traineeDisplayName}. ${SEVERITY_HEADING[row.severity]}. ${issue.text}${issue.more ? `, plus ${issue.more} more` : ""}, ${since}. Open client panel.`}
                        >
                          <span className="hv-who">
                            <span
                              className={`hv-av c${avatarTone(group.traineeDisplayName)}`}
                              aria-hidden
                            >
                              {initials(group.traineeDisplayName)}
                            </span>
                            <b>{group.traineeDisplayName}</b>
                          </span>
                          <span className="hv-issue" title={issue.title}>
                            <span className="hv-issue-txt">{issue.text}</span>
                            {issue.more > 0 ? (
                              <span className="hv-more">+{issue.more} more</span>
                            ) : null}
                          </span>
                          <span className="hv-sev">
                            <StatusChip kind="severity" value={row.severity} />
                          </span>
                          <span className="hv-age" title={`Open since ${opened}`}>
                            {since}
                          </span>
                          <ChevronRight
                            className="hv-chev"
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
