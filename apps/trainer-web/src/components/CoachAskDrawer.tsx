import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import type { CoachAsk } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { whatsappHref } from "../lib/whatsapp";
import { Button } from "./Button";
import { OverflowMenu } from "./OverflowMenu";
import { useOnlineStatus } from "./OfflineBanner";
import { StatusChip } from "./StatusChip";
import { LoadingBlock } from "./StatePanels";

export function CoachAskDrawer({
  askId,
  clientName: clientNameProp,
  onClose,
  onChanged,
}: {
  askId: string;
  clientName: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const online = useOnlineStatus();
  const [ask, setAsk] = useState<CoachAsk | null>(null);
  const [displayName, setDisplayName] = useState(
    clientNameProp.trim() || "Client",
  );
  const [clientWhatsappE164, setClientWhatsappE164] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (clientNameProp.trim()) {
      setDisplayName(clientNameProp.trim());
    }
  }, [clientNameProp]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await stage1Api.listCoachAsks({ status: "open" });
      const found =
        list.items.find((item) => item.id === askId) ??
        (
          await stage1Api.listCoachAsks({ status: "answered" })
        ).items.find((item) => item.id === askId) ??
        null;
      if (!found) {
        setError("This ask is no longer available.");
        setAsk(null);
      } else {
        setAsk(found);
        try {
          const ws = await apiClient.getClientWorkspace(found.relationshipId);
          const name = ws.header.traineeDisplayName?.trim();
          if (name) setDisplayName(name);
          setClientWhatsappE164(ws.header.clientWhatsappE164 ?? null);
        } catch {
          /* keep existing displayName */
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load this ask.",
      );
    } finally {
      setLoading(false);
    }
  }, [askId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        if (document.querySelector(".overflow-menu-list")) return;
        ev.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function markAnswered() {
    if (!ask || !online) return;
    setActing(true);
    setError(null);
    try {
      await stage1Api.answerCoachAsk(
        ask.id,
        {
          note: note.trim() || null,
          visibleToClient,
        },
        createIdempotencyKey(),
      );
      onChanged?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not mark answered.",
      );
    } finally {
      setActing(false);
    }
  }

  const answered = ask?.status === "answered";
  const isPain = ask?.topic === "pain" || ask?.topic === "pain_or_discomfort";
  const itemLabel =
    ask?.itemLabel?.trim() ||
    (ask ? labelFor("coach_ask_item_type", ask.itemType) : "");
  const dateLabel = ask?.itemDate
    ? formatCivilDate(ask.itemDate)
    : "";
  const waHref = clientWhatsappE164
    ? whatsappHref({ phoneE164: clientWhatsappE164 })
    : null;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Asked-coach item"
        data-testid="screen-TW-32"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>
            {displayName} asked about{" "}
            <strong>
              {itemLabel}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </strong>
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="button-ghost"
            style={{ minHeight: 32, padding: "0 8px" }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {loading ? <LoadingBlock label="Loading…" /> : null}

        <div className="drawer-body">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {ask ? (
            <>
              <StatusChip
                kind="ask"
                value={ask.status}
                label={labelFor("coach_ask_topic", ask.topic)}
              />
              <p className="muted">
                Asked {formatRelative(ask.askedAt)} on WhatsApp.
              </p>
              {isPain ? (
                <p role="status" style={{ color: "#B45309" }}>
                  Pain was reported. Check in with {displayName} directly.
                </p>
              ) : null}
              <div className="drawer-source">
                <p style={{ margin: 0, fontWeight: 600 }}>{itemLabel}</p>
                {dateLabel ? (
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {dateLabel}
                  </p>
                ) : null}
              </div>
              {!answered ? (
                <>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <div
                    className="switch-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visibleToClient}
                      aria-label="Visible to client"
                      className={
                        visibleToClient
                          ? "button-secondary is-on"
                          : "button-secondary"
                      }
                      style={{ minHeight: 32, padding: "4px 12px" }}
                      onClick={() => setVisibleToClient((v) => !v)}
                    >
                      {visibleToClient ? "On" : "Off"}
                    </button>
                    <span>Visible to client</span>
                  </div>
                  <p className="drawer-helper">
                    Reply on WhatsApp as usual. Marking it answered lets{" "}
                    {displayName} see it here too.
                  </p>
                </>
              ) : (
                <p className="muted">Coach answered — this item is read-only.</p>
              )}
            </>
          ) : null}
        </div>

        {ask && !answered ? (
          <div className="drawer-foot">
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="primary"
                disabled={acting || !online}
                onClick={() => void markAnswered()}
              >
                Mark answered
              </Button>
              <Button
                variant="secondary"
                disabled={!waHref}
                onClick={() => {
                  if (waHref) {
                    window.open(waHref, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                Open WhatsApp chat
              </Button>
              <OverflowMenu
                items={[
                  {
                    id: "note",
                    label: "Add note",
                    onSelect: () => undefined,
                  },
                  {
                    id: "plan",
                    label: "Adjust plan",
                    onSelect: () => {
                      window.location.assign(
                        `/clients/${ask.relationshipId}/plan`,
                      );
                    },
                  },
                  {
                    id: "open",
                    label: "Open item",
                    onSelect: () => {
                      window.location.assign(`/clients/${ask.relationshipId}`);
                    },
                  },
                ]}
              />
            </div>
            {!online ? (
              <p className="muted" role="status">
                You&apos;re offline. Mark answered needs a connection.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
