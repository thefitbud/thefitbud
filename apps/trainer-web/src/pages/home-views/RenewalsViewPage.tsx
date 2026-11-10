import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Link,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type { SubscriptionAttentionItem } from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate, labelFor } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorState, errorKindFromFailure } from "../../components/StatePanels";
import type { ErrorKind } from "../../components/StatePanels";
import { StatusChip } from "../../components/StatusChip";
import { apiClient } from "../../lib/api";
import "./home-views.css";

/* ------------------------------------------------------------------ */
/* Shared by the renewals and asks views (Z7-10).                      */
/* ------------------------------------------------------------------ */

/** Poll while the tab is visible, the same cadence as Home. */
export const VIEW_POLL_MS = 45_000;

export type ViewLoadError = {
  message: string;
  requestId: string | null;
  kind: ErrorKind;
};

export function viewLoadError(err: unknown, fallback: string): ViewLoadError {
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
  return { message: fallback, requestId: null, kind: "server" };
}

export function viewInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function viewAvatarTone(name: string): number {
  const n = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return (n % 8) + 1;
}

/**
 * Home's scroll position when the trainer opened a view from Home, or null
 * when they arrived another way. Module state so a return from a client page
 * (history Back) still knows the way home.
 */
let homeOrigin: { scrollY: number } | null = null;

function captureHomeOrigin(navigationType: string): void {
  if (navigationType === "POP") return;
  const fromHome =
    document.querySelector('[data-testid="screen-TW-04"]') !== null;
  homeOrigin = fromHome ? { scrollY: window.scrollY } : null;
}

/** Home loads its sections after mount; re-apply the scroll once it is tall enough. */
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
 * Back-to-Home for a full view: pops back to the Home entry the trainer came
 * from (keeping its scroll), or follows the link to a fresh Home otherwise.
 */
export function useHomeBack(): (ev: ReactMouseEvent<HTMLAnchorElement>) => void {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  useState(() => captureHomeOrigin(navigationType));
  useEffect(() => {
    // A fresh visit starts at the top; Back/Forward keeps the browser's place.
    if (navigationType === "PUSH") window.scrollTo(0, 0);
  }, []);
  return useCallback(
    (ev: ReactMouseEvent<HTMLAnchorElement>) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      const origin = homeOrigin;
      if (!origin) return;
      ev.preventDefault();
      homeOrigin = null;
      navigate(-1);
      restoreScroll(origin.scrollY);
    },
    [navigate],
  );
}

/** Runs `tick` every 45 s while the tab is visible, and once on return. */
export function useVisiblePoll(tick: () => void): void {
  const ref = useRef(tick);
  ref.current = tick;
  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer != null) window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!document.hidden) ref.current();
      }, VIEW_POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer != null) window.clearInterval(timer);
        timer = null;
        return;
      }
      ref.current();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}

/** relationshipId → client name, from the trainer's client directory. */
export async function loadClientNames(): Promise<Map<string, string>> {
  const res = await apiClient.listClients({ limit: 100 });
  const map = new Map<string, string>();
  for (const row of res.items) {
    if (row.relationshipId && row.traineeDisplayName) {
      map.set(row.relationshipId, row.traineeDisplayName);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Renewals due                                                       */
/* ------------------------------------------------------------------ */

type Bucket = "expired" | "week";
type Filter = "all" | Bucket;

const BUCKETS: Bucket[] = ["expired", "week"];
const BUCKET_HEADING: Record<Bucket, string> = {
  expired: "Expired",
  week: "Due in the next 7 days",
};
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  expired: "Expired",
  week: "Next 7 days",
};

function bucketOf(item: SubscriptionAttentionItem): Bucket {
  return item.renewalState === "expired" ? "expired" : "week";
}

function civilDayNumber(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return Math.round(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Days from the trainer's today to the renewal date (negative when past). */
export function daysUntil(renewsOn: string, today: string): number {
  return civilDayNumber(renewsOn) - civilDayNumber(today);
}

/** Chip text: "Expired", "Due today", "Due in 2 d". */
export function renewalChipLabel(
  item: SubscriptionAttentionItem,
  today: string,
): string {
  if (item.renewalState === "expired") {
    return labelFor("renewal_state", "expired");
  }
  const days = daysUntil(item.renewsOn, today);
  if (days <= 0) return "Due today";
  return `Due in ${days} d`;
}

export function subscriptionHref(relationshipId: string): string {
  // D14 interim destination until Client settings ships (W8 Z8-3).
  return `/clients/${encodeURIComponent(relationshipId)}/configure#subscription`;
}

/**
 * D13/D14 full view: every subscription that has ended or renews within the
 * renewal window (DS1). A row opens that client's subscription (D14 interim).
 * Tracking only: FitBud does not charge clients.
 */
export function RenewalsViewPage() {
  const goHome = useHomeBack();
  const { me } = useAuth();
  const timeZone =
    me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const today = formatLocalDate(new Date(), timeZone);

  const [params, setParams] = useSearchParams();
  const filterParam = params.get("when");
  const filter: Filter =
    filterParam === "expired" || filterParam === "week" ? filterParam : "all";

  const [items, setItems] = useState<SubscriptionAttentionItem[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<ViewLoadError | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) setError(null);
    const [subs, clients] = await Promise.allSettled([
      apiClient.listSubscriptionAttention(),
      loadClientNames(),
    ]);
    if (clients.status === "fulfilled") setNames(clients.value);
    if (subs.status === "fulfilled") {
      loadedRef.current = true;
      setItems(subs.value.items);
      setRefreshError(false);
      setError(null);
      return;
    }
    if (loadedRef.current) {
      if (!quiet) setRefreshError(true);
      return;
    }
    setError(viewLoadError(subs.reason, "Could not load renewals."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useVisiblePoll(() => void load({ quiet: true }));

  const rows = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => {
      const byDate = a.renewsOn.localeCompare(b.renewsOn);
      if (byDate !== 0) return byDate;
      const an = names.get(a.coachingRelationshipId) ?? a.planName;
      const bn = names.get(b.coachingRelationshipId) ?? b.planName;
      return an.localeCompare(bn);
    });
  }, [items, names]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      expired: rows.filter((r) => bucketOf(r) === "expired").length,
      week: rows.filter((r) => bucketOf(r) === "week").length,
    }),
    [rows],
  );

  const sections = BUCKETS.filter((b) => filter === "all" || filter === b)
    .map((bucket) => ({
      bucket,
      rows: rows.filter((r) => bucketOf(r) === bucket),
    }))
    .filter((s) => s.rows.length > 0);

  function setFilter(next: Filter) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("when");
        else p.set("when", next);
        return p;
      },
      { replace: true },
    );
  }

  const loading = items === null && !error;
  const empty = items !== null && rows.length === 0;

  return (
    <div className="hv-page" data-testid="screen-home-renewals">
      <Link className="hv-back" to="/" onClick={goHome}>
        <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        Home
      </Link>

      <header className="hv-hdr">
        <div className="hv-hdr-main">
          <h1 className="hv-title">
            Renewals due
            {items !== null ? (
              <span
                className="hv-count"
                aria-label={`${counts.all} ${counts.all === 1 ? "renewal" : "renewals"}`}
              >
                {counts.all}
              </span>
            ) : null}
          </h1>
          <p className="hv-sub">
            {empty
              ? "Subscriptions that ended or end in the next 7 days."
              : "Subscriptions that ended or end in the next 7 days. Payments are tracked only; FitBud does not charge clients."}
          </p>
        </div>
      </header>

      {error ? (
        <ErrorState
          title="Couldn't load renewals"
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      ) : null}

      {loading ? (
        <div className="hv-card" aria-busy="true" aria-label="Loading renewals">
          {Array.from({ length: 5 }).map((_, i) => (
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
            <Wallet size={28} strokeWidth={2} />
          </span>
          <h2 id="hv-empty-title">No renewals in the next 7 days</h2>
          <p>
            When a client&apos;s subscription ends within 7 days, it shows here
            with a link to their subscription.
          </p>
          <Link className="hv-btn" to="/" onClick={goHome}>
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            Back to Home
          </Link>
        </section>
      ) : null}

      {items !== null && rows.length > 0 ? (
        <>
          <div className="hv-filters" role="group" aria-label="Filter by due date">
            {(["all", ...BUCKETS] as const).map((key) => {
              const n = counts[key];
              if (key !== "all" && n === 0) return null;
              return (
                <button
                  key={key}
                  type="button"
                  className="hv-chip"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {FILTER_LABEL[key]} <span className="hv-num">{n}</span>
                </button>
              );
            })}
          </div>

          {refreshError ? (
            <p className="form-error" role="alert">
              Couldn&apos;t refresh renewals ·{" "}
              <button type="button" className="text-link" onClick={() => void load()}>
                Retry
              </button>
            </p>
          ) : null}

          <div className="hv-card">
            {sections.map((section) => (
              <section
                key={section.bucket}
                aria-labelledby={`hv-sec-${section.bucket}`}
              >
                <h2 className="hv-sec" id={`hv-sec-${section.bucket}`}>
                  {BUCKET_HEADING[section.bucket]} ·{" "}
                  <span className="hv-num">{section.rows.length}</span>
                </h2>
                <ul className="hv-list">
                  {section.rows.map((item) => {
                    const name =
                      names.get(item.coachingRelationshipId) ?? "Client";
                    const plan = `${item.planName} · ${labelFor("payment_frequency", item.paymentFrequency)}`;
                    const when = `${item.renewalState === "expired" ? "Ended" : "Due"} ${formatCivilDate(item.renewsOn)}`;
                    const chip = renewalChipLabel(item, today);
                    return (
                      <li key={item.coachingRelationshipId}>
                        <Link
                          className="hv-row hv-row-rn"
                          to={subscriptionHref(item.coachingRelationshipId)}
                          aria-label={`${name}. ${plan}. ${when}. ${chip}. Open subscription.`}
                        >
                          <span className="hv-who">
                            <span
                              className={`hv-av c${viewAvatarTone(name)}`}
                              aria-hidden
                            >
                              {viewInitials(name)}
                            </span>
                            <b>{name}</b>
                          </span>
                          <span className="hv-plan">{plan}</span>
                          <span className="hv-when">{when}</span>
                          <span className="hv-sev">
                            <StatusChip
                              kind="renewal"
                              value={item.renewalState}
                              label={chip}
                            />
                          </span>
                          <span className="hv-open" aria-hidden>
                            Open subscription
                          </span>
                          <ChevronRight
                            className="hv-chev hv-chev-phone"
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
