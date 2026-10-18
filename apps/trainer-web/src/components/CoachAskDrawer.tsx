import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatLocalDate,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import type { CoachAsk } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { Button } from "./Button";
import { OverflowMenu } from "./OverflowMenu";
import { StatusChip } from "./StatusChip";
import { LoadingBlock } from "./StatePanels";

export function CoachAskDrawer({
  askId,
  clientName,
  onClose,
  onChanged,
}: {
  askId: string;
  clientName: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [ask, setAsk] = useState<CoachAsk | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function markAnswered() {
    if (!ask) return;
    setActing(true);
    setError(null);
    try {
      await stage1Api.answerCoachAsk(
        ask.id,
        { note: note.trim() || null },
        createIdempotencyKey(),
      );
      void visibleToClient;
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
  const itemLabel = ask
    ? labelFor("coach_ask_item_type", ask.itemType)
    : "";
  const dateLabel = ask
    ? formatCivilDate(
        formatLocalDate(
          new Date(ask.askedAt),
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        ),
      )
    : "";

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
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
            {clientName} asked about <strong>{itemLabel}</strong>
            {dateLabel ? ` · ${dateLabel}` : ""}
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
                  Pain was reported. Check in with {clientName} directly.
                </p>
              ) : null}
              <div className="drawer-source">
                <p style={{ margin: 0, fontWeight: 600 }}>{itemLabel}</p>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  Topic: {labelFor("coach_ask_topic", ask.topic)}
                </p>
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
                  <label
                    className="field"
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleToClient}
                      onChange={(e) => setVisibleToClient(e.target.checked)}
                    />
                    <span>Visible to client</span>
                  </label>
                  <p className="drawer-helper">
                    Reply on WhatsApp as usual. Marking it answered lets{" "}
                    {clientName} see it here too.
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
                disabled={acting}
                onClick={() => void markAnswered()}
              >
                Mark answered
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  window.open("https://wa.me/", "_blank", "noopener,noreferrer")
                }
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
          </div>
        ) : null}
      </aside>
    </div>
  );
}
