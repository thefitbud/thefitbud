import { useState } from "react";
import { stage1Api } from "../../lib/stage1-api";
import { createIdempotencyKey } from "../../lib/idempotency";

export function CoachingLifecycleModals({
  mode,
  relationshipId,
  traineeName,
  onClose,
  onChanged,
}: {
  mode: "end" | "reactivate";
  relationshipId: string;
  traineeName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [endReason, setEndReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [intakeUpdate, setIntakeUpdate] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmEnd() {
    if (confirmName.trim() !== traineeName.trim()) {
      setError(`Type ${traineeName} to confirm.`);
      return;
    }
    setActing(true);
    setError(null);
    try {
      await stage1Api.endRelationship(
        relationshipId,
        { reason: endReason.trim() || undefined },
        createIdempotencyKey(),
      );
      onChanged();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't end coaching. Nothing has changed.",
      );
    } finally {
      setActing(false);
    }
  }

  async function confirmReactivate() {
    setActing(true);
    setError(null);
    try {
      await stage1Api.requestReactivation(
        relationshipId,
        { intakeUpdateRequested: intakeUpdate },
        createIdempotencyKey(),
      );
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start reactivation.");
    } finally {
      setActing(false);
    }
  }

  if (mode === "end") {
    return (
      <div className="drawer-backdrop" role="presentation">
        <dialog className="modal-card" open>
          <h2>End coaching with {traineeName}?</h2>
          <p className="muted">
            {traineeName.split(" ")[0]} keeps their account and history. You&apos;ll
            both have read-only access. Plans, reminders and nudges stop today. You
            can reactivate later.
          </p>
          <label className="field">
            <span>Reason (private, optional)</span>
            <select value={endReason} onChange={(e) => setEndReason(e.target.value)}>
              <option value="">No reason</option>
              <option value="completed">Goals reached</option>
              <option value="paused">Taking a break</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Type {traineeName} to confirm</span>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="button-row">
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={acting}
              onClick={() => void confirmEnd()}
            >
              End coaching
            </button>
          </div>
        </dialog>
      </div>
    );
  }

  return (
    <div className="drawer-backdrop" role="presentation">
      <dialog className="modal-card" open>
        <h2>Reactivate coaching with {traineeName}?</h2>
        <p>
          Her history, your notes, intake answers, configuration and check-in
          schedule come back. Reminders restart only after you assign a plan.
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={intakeUpdate}
            onChange={(e) => setIntakeUpdate(e.target.checked)}
          />
          Ask {traineeName.split(" ")[0]} to update intake
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="button-row">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={acting}
            onClick={() => void confirmReactivate()}
          >
            Send reactivation request
          </button>
        </div>
      </dialog>
    </div>
  );
}
