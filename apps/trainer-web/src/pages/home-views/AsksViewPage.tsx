import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Info, MessageCircle } from "lucide-react";
import type { CoachAsk } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { CoachAskDrawer } from "../../components/CoachAskDrawer";
import { ErrorState } from "../../components/StatePanels";
import { stage1Api } from "../../lib/stage1-api";
import {
  loadClientNames,
  daysUntil,
  useHomeBack,
  useVisiblePoll,
  viewAvatarTone,
  viewInitials,
  viewLoadError,
  type ViewLoadError,
} from "./RenewalsViewPage";
import "./home-views.css";

function askItemLabel(ask: CoachAsk): string {
  return (
    ask.itemLabel?.trim() ||
    labelFor("coach_ask_item_type", ask.itemType) ||
    "an item"
  );
}

/** "Asked about Lunch · Wed 4 Nov" (the same facts Home's ask row shows). */
export function askLine(ask: CoachAsk): string {
  const date = ask.itemDate ? ` · ${formatCivilDate(ask.itemDate)}` : "";
  return `Asked about ${askItemLabel(ask)}${date}`;
}

/** The ask line with the date kept on one line when it wraps. */
function AskLineText({ ask }: { ask: CoachAsk }) {
  return (
    <>
      Asked about {askItemLabel(ask)}
      {ask.itemDate ? (
        <>
          {" · "}
          <span className="hv-nowrap">{formatCivilDate(ask.itemDate)}</span>
        </>
      ) : null}
    </>
  );
}

/** "Today, 8:12 am", "Yesterday, 9:05 pm", else "Sun 1 Nov". */
export function askedWhen(iso: string, timeZone: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = formatLocalDate(at, timeZone);
  const today = formatLocalDate(now, timeZone);
  const ago = -daysUntil(day, today);
  if (ago <= 0) return `Today, ${formatClockTime(at, timeZone)}`;
  if (ago === 1) return `Yesterday, ${formatClockTime(at, timeZone)}`;
  return formatCivilDate(day, { now });
}

function isPain(ask: CoachAsk): boolean {
  return ask.topic === "pain";
}

/** Pain first (until answered), then newest. */
function sortAsks(asks: CoachAsk[]): CoachAsk[] {
  return [...asks].sort((a, b) => {
    const pain = Number(isPain(b)) - Number(isPain(a));
    if (pain !== 0) return pain;
    return b.askedAt.localeCompare(a.askedAt);
  });
}

/**
 * D13 full view: every open "Ask coach on WhatsApp" item (DS1). A row opens
 * the same ask drawer Home's ask rows open, with the client's name.
 */
export function AsksViewPage() {
  const goHome = useHomeBack();
  const { me } = useAuth();
  const timeZone =
    me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const [params, setParams] = useSearchParams();
  const drawerAskId = params.get("ask");

  const [asks, setAsks] = useState<CoachAsk[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<ViewLoadError | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const loadedRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const answeredRef = useRef<string | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) setError(null);
    const [open, clients] = await Promise.allSettled([
      stage1Api.listCoachAsks({ status: "open" }),
      loadClientNames(),
    ]);
    if (clients.status === "fulfilled") setNames(clients.value);
    if (open.status === "fulfilled") {
      loadedRef.current = true;
      setAsks(open.value.items);
      setRefreshError(false);
      setError(null);
      return;
    }
    if (loadedRef.current) {
      if (!quiet) setRefreshError(true);
      return;
    }
    setError(viewLoadError(open.reason, "Could not load asked-coach items."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useVisiblePoll(() => void load({ quiet: true }));

  const rows = useMemo(() => (asks ? sortAsks(asks) : []), [asks]);
  const hasPain = rows.some(isPain);

  function nameFor(ask: CoachAsk): string {
    return names.get(ask.relationshipId) ?? "Client";
  }

  function openAsk(id: string) {
    // Replace, so Back (and the Home link) still return to Home.
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("ask", id);
        return p;
      },
      { replace: true },
    );
  }

  const onAskChanged = useCallback(() => {
    const id = drawerAskId;
    answeredRef.current = id;
    if (id) setAsks((prev) => prev?.filter((a) => a.id !== id) ?? prev);
    void load({ quiet: true });
  }, [drawerAskId, load]);

  const closeDrawer = useCallback(() => {
    const id = drawerAskId;
    const answered = id != null && answeredRef.current === id;
    answeredRef.current = null;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("ask");
        return p;
      },
      { replace: true },
    );
    // Focus the row the trainer came from, or its neighbour once answered.
    const ids = rows.map((a) => a.id);
    const idx = id ? ids.indexOf(id) : -1;
    const candidates: string[] = [];
    if (id && !answered) candidates.push(id);
    if (idx >= 0) {
      candidates.push(...ids.slice(idx + 1), ...ids.slice(0, idx).reverse());
    }
    window.requestAnimationFrame(() => {
      for (const cid of candidates) {
        const el = document.querySelector<HTMLButtonElement>(
          `button[data-ask-row="${CSS.escape(cid)}"]`,
        );
        if (el) {
          el.focus();
          return;
        }
      }
      titleRef.current?.focus();
    });
  }, [drawerAskId, rows, setParams]);

  const loading = asks === null && !error;
  const empty = asks !== null && rows.length === 0;
  // Keep the name once the answered ask leaves the list under the drawer.
  const drawerNameRef = useRef<{ id: string; name: string } | null>(null);
  const drawerAsk = drawerAskId
    ? (asks ?? []).find((a) => a.id === drawerAskId)
    : undefined;
  if (drawerAsk && names.has(drawerAsk.relationshipId)) {
    drawerNameRef.current = { id: drawerAsk.id, name: nameFor(drawerAsk) };
  }
  const drawerName =
    drawerNameRef.current && drawerNameRef.current.id === drawerAskId
      ? drawerNameRef.current.name
      : drawerAsk
        ? nameFor(drawerAsk)
        : "";

  return (
    <div className="hv-page" data-testid="screen-home-asks">
      <Link className="hv-back" to="/" onClick={goHome}>
        <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        Home
      </Link>

      <header className="hv-hdr">
        <div className="hv-hdr-main">
          <h1 className="hv-title" ref={titleRef} tabIndex={-1}>
            Asked you on WhatsApp
            {asks !== null ? (
              <span
                className="hv-count"
                aria-label={`${rows.length} open ${rows.length === 1 ? "question" : "questions"}`}
              >
                {rows.length}
              </span>
            ) : null}
          </h1>
          <p className="hv-sub">
            {empty
              ? "Questions clients sent from the app."
              : "Questions clients sent from the app. Open one to reply on WhatsApp or mark it answered."}
          </p>
        </div>
      </header>

      {error ? (
        <ErrorState
          title="Couldn't load asked-coach items"
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      ) : null}

      {loading ? (
        <div className="hv-card" aria-busy="true" aria-label="Loading questions">
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
            <MessageCircle size={28} strokeWidth={2} />
          </span>
          <h2 id="hv-empty-title">No open questions</h2>
          <p>
            When a client taps “Ask coach on WhatsApp”, the question shows here
            until you mark it answered.
          </p>
          <Link className="hv-btn" to="/" onClick={goHome}>
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            Back to Home
          </Link>
        </section>
      ) : null}

      {asks !== null && rows.length > 0 ? (
        <>
          {refreshError ? (
            <p className="form-error" role="alert">
              Couldn&apos;t refresh questions ·{" "}
              <button type="button" className="text-link" onClick={() => void load()}>
                Retry
              </button>
            </p>
          ) : null}

          <div className="hv-card">
            <ul className="hv-list" aria-label="Open questions">
              {rows.map((ask) => {
                const name = nameFor(ask);
                const line = askLine(ask);
                const topic = labelFor("coach_ask_topic", ask.topic);
                const when = askedWhen(ask.askedAt, timeZone);
                return (
                  <li key={ask.id}>
                    <button
                      type="button"
                      className="hv-row hv-row-ask"
                      data-ask-row={ask.id}
                      aria-haspopup="dialog"
                      aria-label={`${name}. ${line}. ${topic}. ${when}. Open the ask.`}
                      onClick={() => openAsk(ask.id)}
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
                      <span className="hv-issue">
                        <span className="hv-issue-txt">
                          <AskLineText ask={ask} />
                        </span>
                      </span>
                      <span className="hv-sev">
                        <span
                          className={`hv-topic${isPain(ask) ? " is-pain" : ""}`}
                        >
                          {topic}
                        </span>
                      </span>
                      <span className="hv-age">{when}</span>
                      <ChevronRight
                        className="hv-chev"
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {hasPain ? (
            <p className="hv-note">
              <Info size={16} strokeWidth={2} aria-hidden />
              Pain questions are marked red and stay at the top until you
              answer them.
            </p>
          ) : null}
        </>
      ) : null}

      {drawerAskId ? (
        <CoachAskDrawer
          key={drawerAskId}
          askId={drawerAskId}
          clientName={drawerName}
          onClose={closeDrawer}
          onChanged={onAskChanged}
        />
      ) : null}
    </div>
  );
}
