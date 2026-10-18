import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatLocalDate,
  formatPersonName,
  labelFor,
} from "@fitbud/core";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  ReengagementCandidatesResponse,
  SubscriptionAttentionItem,
} from "@fitbud/contracts";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type ReengagementCandidate =
  ReengagementCandidatesResponse["items"][number];
import { useAuth } from "../auth/AuthProvider";
import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { apiClient } from "../lib/api";
import { formatAgeMinutes } from "../lib/format";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

const ATTENTION_CAP = 8;

function severityRank(severity: "critical" | "attention"): number {
  return severity === "critical" ? 0 : 1;
}

function pickPrimaryItem(group: AttentionGroup) {
  const sorted = [...group.items].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return b.ageMinutes - a.ageMinutes;
  });
  return sorted[0];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function HomePage() {
  const { me } = useAuth();
  const timeZone =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const todayLabel = formatCivilDate(formatLocalDate(new Date(), timeZone));
  const trainerFullName = formatPersonName(me?.trainerProfile?.displayName);
  const trainerName = trainerFullName.split(/\s+/)[0] ?? trainerFullName;
  const [params, setParams] = useSearchParams();
  const drawerExceptionId = params.get("exception");
  const drawerAskId = params.get("ask");

  const [groups, setGroups] = useState<AttentionGroup[]>([]);
  const [coachAsks, setCoachAsks] = useState<CoachAsk[]>([]);
  const [reengage, setReengage] = useState<ReengagementCandidate[]>([]);
  const [renewals, setRenewals] = useState<SubscriptionAttentionItem[]>([]);
  const [nameByRid, setNameByRid] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attention, asks, candidates, renewalList, clients] =
        await Promise.all([
          stage1Api.getAttentionGroups(),
          stage1Api.listCoachAsks({ status: "open" }) as Promise<{
            items: CoachAsk[];
          }>,
          stage1Api.getReengagementCandidates(),
          apiClient.listSubscriptionAttention(),
          apiClient.listClients({ limit: 50 }),
        ]);
      setGroups(attention.groups);
      setCoachAsks(asks.items);
      setReengage(candidates.items);
      setRenewals(renewalList.items);
      const names = new Map<string, string>();
      for (const row of clients.items) {
        const rid = row.relationshipId;
        const label = row.traineeDisplayName;
        if (rid && label) names.set(rid, label);
      }
      for (const g of attention.groups) {
        names.set(g.relationshipId, g.traineeDisplayName);
      }
      setNameByRid(names);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load your home feed.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeHints(apiClient, [...nameByRid.keys()], () => {
    void load();
  });

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aItem = pickPrimaryItem(a);
      const bItem = pickPrimaryItem(b);
      if (!aItem || !bItem) return 0;
      const sev = severityRank(aItem.severity) - severityRank(bItem.severity);
      if (sev !== 0) return sev;
      return bItem.ageMinutes - aItem.ageMinutes;
    });
  }, [groups]);

  const visibleGroups = showAllAttention
    ? sortedGroups
    : sortedGroups.slice(0, ATTENTION_CAP);

  const acknowledgedGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          group: g,
          items: g.items.filter(
            (i: AttentionGroup["items"][number]) => i.status === "acknowledged",
          ),
        }))
        .filter((g) => g.items.length > 0),
    [groups],
  );

  function openException(id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("exception", id);
      return next;
    });
  }

  function closeDrawer() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("exception");
      next.delete("ask");
      return next;
    });
  }

  async function markAskAnswered(askId: string) {
    await stage1Api.answerCoachAsk(askId, {}, createIdempotencyKey());
    await load();
    closeDrawer();
  }

  const allClear =
    !loading &&
    !error &&
    sortedGroups.length === 0 &&
    coachAsks.length === 0 &&
    reengage.length === 0 &&
    renewals.length === 0;

  return (
    <div className="home-triage" data-testid="screen-TW-04">
      <header className="page-header">
        <div>
          <h1>Today</h1>
          <p className="lede muted">{todayLabel}</p>
          {trainerName ? (
            <p className="muted">Hi, {trainerName}</p>
          ) : null}
          <p className="lede">
            One row per client. Review the most important item first.
          </p>
        </div>
      </header>

      {loading ? <LoadingBlock label="Loading needs attention…" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : null}

      {allClear ? (
        <div className="state-panel is-empty">
          <h2>All clear</h2>
          <p>No clients need you right now. Normal activity stays quiet.</p>
          <Link className="button-primary" to="/clients/add">
            Invite a client
          </Link>
        </div>
      ) : null}

      {sortedGroups.length > 0 ? (
        <section aria-labelledby="needs-attention-heading">
          <div className="section-head">
            <h2 id="needs-attention-heading">Needs attention</h2>
          </div>
          <ul className="attention-rows" role="list">
            {visibleGroups.map((group) => {
              const primary = pickPrimaryItem(group);
              if (!primary) return null;
              const chip = `${primary.severity === "critical" ? "Critical" : "Attention"} · ${formatAgeMinutes(primary.ageMinutes)}`;
              return (
                <li key={group.relationshipId} className="attention-row">
                  <span className="avatar" aria-hidden="true">
                    {initials(group.traineeDisplayName)}
                  </span>
                  <div className="attention-row-main">
                    <p className="attention-row-name">{group.traineeDisplayName}</p>
                    <p className="attention-row-issue">
                      {labelFor("exception_type", primary.type)}
                    </p>
                  </div>
                  <span className={`severity-chip is-${primary.severity}`}>
                    {chip}
                  </span>
                  <button
                    type="button"
                    className="button-primary button-compact"
                    onClick={() => openException(primary.id)}
                  >
                    Review
                  </button>
                </li>
              );
            })}
          </ul>
          {sortedGroups.length > ATTENTION_CAP && !showAllAttention ? (
            <button
              type="button"
              className="text-link"
              onClick={() => setShowAllAttention(true)}
            >
              View all ({sortedGroups.length})
            </button>
          ) : null}
        </section>
      ) : null}

      {acknowledgedGroups.length > 0 ? (
        <section aria-labelledby="ack-heading">
          <h2 id="ack-heading">Acknowledged</h2>
          <ul className="attention-rows">
            {acknowledgedGroups.map(({ group, items }) => (
              <li key={group.relationshipId} className="attention-row is-muted">
                <span className="avatar">{initials(group.traineeDisplayName)}</span>
                <div className="attention-row-main">
                  <p className="attention-row-name">{group.traineeDisplayName}</p>
                  <p className="attention-row-issue">{items[0]?.summary}</p>
                </div>
                <button
                  type="button"
                  className="button-secondary button-compact"
                  onClick={() => items[0] && openException(items[0].id)}
                >
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {coachAsks.length > 0 ? (
        <section aria-labelledby="asks-heading" data-testid="screen-TW-32">
          <h2 id="asks-heading">Asked you on WhatsApp</h2>
          <ul className="attention-rows">
            {coachAsks.map((ask) => (
              <li key={ask.id} className="attention-row">
                <div className="attention-row-main">
                  <p className="attention-row-name">
                    {nameByRid.get(ask.relationshipId) ?? "Client"}
                  </p>
                  <p className="attention-row-issue">
                    Asked about {labelFor("coach_ask_topic", ask.topic)}
                  </p>
                </div>
                <button
                  type="button"
                  className="button-primary button-compact"
                  onClick={() => void markAskAnswered(ask.id)}
                >
                  Mark answered
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reengage.length > 0 ? (
        <section aria-labelledby="reengage-heading">
          <h2 id="reengage-heading">Re-engage</h2>
          <ul className="attention-rows">
            {reengage.map((item) => (
              <li key={item.relationshipId} className="attention-row">
                <div className="attention-row-main">
                  <p className="attention-row-name">{item.traineeDisplayName}</p>
                  <p className="attention-row-issue">
                    No logs recently · reminders unanswered
                  </p>
                </div>
                <a
                  className="button-secondary button-compact"
                  href={item.waMeUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {renewals.length > 0 ? (
        <section aria-labelledby="renewal-heading">
          <h2 id="renewal-heading">Renewals</h2>
          <ul className="attention-rows">
            {renewals.map((item) => (
              <li key={item.coachingRelationshipId} className="attention-row">
                <div className="attention-row-main">
                  <p className="attention-row-name">
                    {nameByRid.get(item.coachingRelationshipId) ??
                      item.planName}
                  </p>
                  <p className="attention-row-issue">
                    Renewal {labelFor("renewal_state", item.renewalState)} ·{" "}
                    {formatCivilDate(item.renewsOn)}
                  </p>
                </div>
                <Link
                  className="button-secondary button-compact"
                  to={`/clients/${item.coachingRelationshipId}/configure`}
                >
                  Open settings
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {drawerExceptionId ? (
        <ExceptionDrawer
          exceptionId={drawerExceptionId}
          onClose={closeDrawer}
          onChanged={() => void load()}
        />
      ) : null}

      {drawerAskId ? (
        <div className="drawer-backdrop" onClick={closeDrawer}>
          <aside className="drawer-panel" data-testid="screen-TW-32" onClick={(e) => e.stopPropagation()}>
            <p>Coach ask {drawerAskId}</p>
            <button type="button" onClick={() => void markAskAnswered(drawerAskId)}>
              Mark answered
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
