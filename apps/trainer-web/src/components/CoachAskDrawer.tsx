import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Dumbbell, Heart, Utensils, X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatClockTime,
  formatKcal,
  formatRelative,
  labelFor,
  possessivePronoun,
} from "@fitbud/core";
import type { CoachAsk, MealAssignment, WorkoutAssignment } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { whatsappHref } from "../lib/whatsapp";
import {
  formatMealTime,
  mealItemsLine,
  mealKcal,
} from "./builder/formatters";
import { Button } from "./Button";
import { useOnlineStatus } from "./OfflineBanner";
import { avatarToneClass, initials } from "./side-panel/panelModel";
import { LoadingBlock } from "./StatePanels";
import { WhatsAppGlyph } from "./WhatsAppGlyph";
import "./CoachAskDrawer.css";

type SourceDetail = {
  itemRowLabel: string;
  itemRowValue: string;
  planned: string;
  logLabel: string;
  LogIcon: typeof Utensils;
};

function isPainTopic(topic: string): boolean {
  return topic === "pain" || topic === "pain_or_discomfort";
}

/** Object pronoun for copy like "ask her to pause". */
function objectPronoun(genderOrPronoun: string | null | undefined): string {
  const possessive = possessivePronoun(genderOrPronoun);
  if (possessive === "her") return "her";
  if (possessive === "his") return "him";
  return "them";
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/).filter(Boolean)[0] || "Client";
}

function shortWeekday(civilDate: string): string {
  const full = formatCivilDate(civilDate);
  return full.split(/\s+/)[0] ?? full;
}

function mealPlannedLine(meal: MealAssignment): string {
  const items = meal.prescription.items ?? [];
  const line = mealItemsLine(items);
  const kcal = mealKcal(items);
  if (kcal == null) return line;
  return `${line} · ${formatKcal(kcal)}`;
}

function workoutPlannedLine(workout: WorkoutAssignment): string {
  const exercises = [...(workout.workoutDay?.exercises ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  const first = exercises[0];
  if (!first) {
    return `${workout.workoutDayName} · no exercises yet`;
  }
  const sets = first.setTargets.length;
  const sample = [...first.setTargets].sort((a, b) => a.order - b.order)[0];
  if (sets > 0 && sample?.reps != null) {
    return `${first.name} · ${sets} x ${sample.reps}`;
  }
  if (sets > 0) {
    return `${first.name} · ${sets} ${sets === 1 ? "set" : "sets"}`;
  }
  return first.name;
}

function logKind(itemType: CoachAsk["itemType"]): {
  label: string;
  Icon: typeof Utensils;
} {
  if (itemType === "meal_assignment") {
    return { label: "meal log", Icon: Utensils };
  }
  if (itemType === "workout_assignment" || itemType === "exercise_execution") {
    return { label: "workout log", Icon: Dumbbell };
  }
  if (itemType === "checkin") {
    return { label: "check-in", Icon: ClipboardCheck };
  }
  return { label: "plan", Icon: ClipboardCheck };
}

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
  const [possessive, setPossessive] = useState("their");
  const [objectForm, setObjectForm] = useState("them");
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setAsk(null);
    setSource(null);
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
        setSource(null);
        return;
      }

      let nextName = clientNameProp.trim() || "Client";
      let nextWa: string | null = null;
      let gender: string | null = null;
      let tz = "Asia/Kolkata";
      try {
        const ws = await apiClient.getClientWorkspace(found.relationshipId);
        const name = ws.header.traineeDisplayName?.trim();
        if (name) nextName = name;
        nextWa = ws.header.clientWhatsappE164 ?? null;
        gender = ws.header.traineeProfile?.gender ?? null;
        tz = ws.header.traineeTimezone || tz;
      } catch {
        /* keep prop display name */
      }

      const kind = logKind(found.itemType);
      const itemTypeLabel = labelFor("coach_ask_item_type", found.itemType);
      let itemLabel =
        found.itemLabel?.trim() || itemTypeLabel || "Item";
      let civilDate = found.itemDate ?? null;
      let timeLabel = "";
      let planned = "—";

      try {
        if (found.itemType === "meal_assignment") {
          const meal = await apiClient.getMealAssignment(found.itemId);
          itemLabel = meal.mealName || itemLabel;
          civilDate = meal.localDate || civilDate;
          timeLabel =
            formatMealTime(meal.prescription.localTime) ||
            formatClockTime(meal.windowStartsAt, tz);
          planned = mealPlannedLine(meal);
        } else if (
          found.itemType === "workout_assignment" ||
          found.itemType === "exercise_execution"
        ) {
          const workout = await apiClient.getWorkoutAssignment(found.itemId);
          itemLabel = workout.workoutDayName || itemLabel;
          civilDate = workout.localDate || civilDate;
          planned = workoutPlannedLine(workout);
        }
      } catch {
        /* source may be gone; keep ask fields */
      }

      const dateFull = civilDate ? formatCivilDate(civilDate) : "";
      const itemRowValue = [itemLabel, dateFull, timeLabel]
        .filter(Boolean)
        .join(" · ");

      setDisplayName(nextName);
      setClientWhatsappE164(nextWa);
      setPossessive(possessivePronoun(gender));
      setObjectForm(objectPronoun(gender));
      setSource({
        itemRowLabel: itemTypeLabel || "Item",
        itemRowValue: itemRowValue || itemLabel,
        planned,
        logLabel: kind.label,
        LogIcon: kind.Icon,
      });
      setAsk(found);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load this ask.",
      );
      setAsk(null);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [askId, clientNameProp]);

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
        return;
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function markDone() {
    if (!ask || !online) return;
    setActing(true);
    setError(null);
    try {
      await stage1Api.answerCoachAsk(
        ask.id,
        {
          note: null,
          visibleToClient: false,
        },
        createIdempotencyKey(),
      );
      onChanged?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not mark done.",
      );
    } finally {
      setActing(false);
    }
  }

  const answered = ask?.status === "answered";
  const pain = ask ? isPainTopic(ask.topic) : false;
  const itemLabel =
    ask?.itemLabel?.trim() ||
    (ask ? labelFor("coach_ask_item_type", ask.itemType) : "");
  const titleDate = ask?.itemDate ? shortWeekday(ask.itemDate) : "";
  const title = titleDate
    ? `Asked about ${itemLabel} · ${titleDate}`
    : `Asked about ${itemLabel}`;
  const relative = ask ? formatRelative(ask.askedAt) : "";
  const topicLabel = ask ? labelFor("coach_ask_topic", ask.topic) : "";
  const waHref = clientWhatsappE164
    ? whatsappHref({ phoneE164: clientWhatsappE164 })
    : null;
  const givenName = firstName(displayName);
  const LogIcon = source?.LogIcon ?? Utensils;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="drawer-panel cad-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Asked-coach item"
        data-testid="screen-TW-32"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cad-head">
          <span
            className={`${avatarToneClass(displayName)} cad-avatar`}
            aria-hidden="true"
          >
            {initials(displayName)}
          </span>
          <div className="cad-head-who">
            <h2 className="cad-name">{displayName}</h2>
            {ask ? (
              pain ? (
                <span className="cad-chip cad-chip-pain" role="status">
                  <Heart size={12} strokeWidth={2} aria-hidden />
                  Pain
                </span>
              ) : (
                <span className="cad-chip cad-chip-ask">Asked coach</span>
              )
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="cad-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {loading ? <LoadingBlock label="Loading…" /> : null}

        <div className="drawer-body cad-body">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {ask ? (
            <>
              <div>
                <h3 className="cad-title">{title}</h3>
                <p className="cad-sub">
                  Opened WhatsApp from {possessive} log
                  {relative ? ` · ${relative}` : ""}
                </p>
              </div>

              {pain ? (
                <p className="cad-pain" role="status">
                  <Heart size={16} strokeWidth={2} aria-hidden />
                  <span>
                    Pain topic. Reply today. If it sounds serious, ask{" "}
                    {objectForm} to pause training and see a doctor.
                  </span>
                </p>
              ) : null}

              <div className="drawer-source cad-source">
                <p className="cad-source-head">
                  <LogIcon size={16} strokeWidth={1.75} aria-hidden />
                  <span>
                    From {possessive} {source?.logLabel ?? "log"}
                  </span>
                </p>
                <dl className="cad-source-rows">
                  <dt>
                    {source?.itemRowLabel ?? "Item"}
                    <span className="sr-only">: </span>
                  </dt>
                  <dd>{source?.itemRowValue || itemLabel || "—"}</dd>
                  <dt>
                    Planned<span className="sr-only">: </span>
                  </dt>
                  <dd>{source?.planned ?? "—"}</dd>
                  <dt>
                    Topic<span className="sr-only">: </span>
                  </dt>
                  <dd>{topicLabel || "—"}</dd>
                </dl>
              </div>

              <p className="cad-helper">
                The message itself is in your WhatsApp. FitBud only knows{" "}
                {givenName} opened it from this log.
              </p>

              {answered ? (
                <p className="muted">Coach answered — this item is read-only.</p>
              ) : null}
            </>
          ) : null}
        </div>

        {ask && !answered ? (
          <div className="drawer-foot cad-foot">
            <div className="cad-actions">
              <Button
                variant="primary"
                disabled={!waHref}
                onClick={() => {
                  if (waHref) {
                    window.open(waHref, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <WhatsAppGlyph />
                Reply on WhatsApp
              </Button>
              <Button
                variant="secondary"
                disabled={acting || !online}
                onClick={() => void markDone()}
              >
                Mark done
              </Button>
            </div>
            <p className="cad-foot-note">
              Mark done once you&apos;ve replied. Nothing is sent from FitBud.
            </p>
            {!online ? (
              <p className="muted" role="status">
                You&apos;re offline. Mark done needs a connection.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
