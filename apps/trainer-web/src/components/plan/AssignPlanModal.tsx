import { useState, type FormEvent } from "react";
import type { AssignPlanVersionRequest } from "@fitbud/contracts";
import { stage1Api } from "../../lib/stage1-api";
import { createIdempotencyKey } from "../../lib/idempotency";

function toEffectiveFromIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function AssignPlanModal({
  planId,
  versionId,
  traineeTimezone,
  nutritionOnly,
  onClose,
  onAssigned,
}: {
  planId: string;
  versionId: string;
  traineeTimezone?: string;
  nutritionOnly?: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [windowDays, setWindowDays] = useState(7);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dietScope, setDietScope] = useState<"today_onward" | "today_only">(
    "today_onward",
  );
  const [notifyClient, setNotifyClient] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildBody(dryRun: boolean): AssignPlanVersionRequest {
    return {
      window: windowDays,
      effectiveFrom: toEffectiveFromIso(effectiveFrom),
      dietChangeScope: nutritionOnly ? dietScope : undefined,
      notifyClient,
      dryRun,
    };
  }

  async function dryRun() {
    setActing(true);
    setError(null);
    try {
      const result = await stage1Api.assignPlanVersion(
        planId,
        versionId,
        buildBody(true),
        createIdempotencyKey(),
      );
      setPreview(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setActing(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setActing(true);
    setError(null);
    try {
      await stage1Api.assignPlanVersion(
        planId,
        versionId,
        buildBody(false),
        createIdempotencyKey(),
      );
      onAssigned();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't create this week's schedule · Retry",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation">
      <dialog className="modal-card modal-wide" open data-testid="screen-TW-16">
        <h2>Publish & schedule</h2>
        {traineeTimezone ? (
          <p className="muted">Dates use client time · {traineeTimezone}</p>
        ) : null}
        <form className="stack-form" onSubmit={publish}>
          <label className="field">
            <span>Effective from</span>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
          <fieldset className="field">
            <legend>First schedule window</legend>
            <label className="radio-row">
              <input
                type="radio"
                checked={windowDays === 7}
                onChange={() => setWindowDays(7)}
              />
              Next 7 days
            </label>
            <label className="radio-row">
              <input
                type="radio"
                checked={windowDays === 14}
                onChange={() => setWindowDays(14)}
              />
              Next 14 days
            </label>
          </fieldset>
          {nutritionOnly ? (
            <fieldset className="field">
              <legend>Diet change scope</legend>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={dietScope === "today_onward"}
                  onChange={() => setDietScope("today_onward")}
                />
                From today onward
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={dietScope === "today_only"}
                  onChange={() => setDietScope("today_only")}
                />
                Today only
              </label>
            </fieldset>
          ) : null}
          <label className="switch-row">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
            />
            Notify client
          </label>
          {preview ? <pre className="assign-preview">{preview}</pre> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="button-row">
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={acting}
              onClick={() => void dryRun()}
            >
              Preview
            </button>
            <button type="submit" className="button-primary" disabled={acting}>
              Publish & schedule
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
