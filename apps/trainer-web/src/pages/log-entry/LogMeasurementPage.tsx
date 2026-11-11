import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachEditMeasurementRequest,
  CreateMeasurementRequest,
  Measurement,
  MeasurementType,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/Button";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { apiClient } from "../../lib/api";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import { performedAtFor } from "../log-workout/logWorkoutModel";
import type { WorkspaceOutletContext } from "../workspaceContext";
import { patchClientMeasurement } from "./coachLogApi";
import {
  DayChips,
  EndedState,
  EntryHead,
  FailureBanner,
  IconCalendar,
  classifyFailure,
  firstName,
  isReloadFailure,
  useFrozenRequest,
  type SaveFailure,
} from "./entryShared";
import {
  LOG_WINDOW_DAYS,
  MEASUREMENT_TYPES,
  buildMeasurementEdit,
  coachEntryTag,
  isWithinWindow,
  measurementValueProblem,
  parseMeasurementValue,
  unitFor,
} from "./logEntryModel";

type Mode = "create" | "edit";

type Request =
  | { kind: "create"; body: CreateMeasurementRequest }
  | { kind: "edit"; body: CoachEditMeasurementRequest };

/** Log a body measurement for the client, or correct one the client or coach logged. */
export function LogMeasurementPage({ mode }: { mode: Mode }) {
  const { relationshipId = "", measurementId } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { workspace, ended = false, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const header = workspace?.header;
  const clientName = header?.traineeDisplayName ?? "Client";
  const first = firstName(clientName);
  const timezone = header
    ? resolveTraineeTimezone(header).timezone
    : (me?.timezone ?? "Asia/Kolkata");
  const today = useMemo(() => formatLocalDate(new Date(), timezone), [timezone]);
  const earliest = addDaysToLocalDate(today, -LOG_WINDOW_DAYS);
  const progressHref = `/clients/${relationshipId}/progress`;

  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [type, setType] = useState<MeasurementType>("body_weight_kg");
  const [valueText, setValueText] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frozen = useFrozenRequest<Request>();
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (mode !== "edit" || ended || !relationshipId) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiClient.listMeasurements(relationshipId);
      if (seq !== loadSeq.current) return;
      const found = list.items.find((row) => row.id === measurementId) ?? null;
      if (!found) {
        setMeasurement(null);
        setLoadError("This measurement is not in the latest entries for this client.");
        return;
      }
      setMeasurement(found);
      setType(found.type);
      setValueText(String(found.value));
      setSelectedDate(formatLocalDate(new Date(found.observedAt), timezone));
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(
        err instanceof ApiClientError ? err.message : "Could not load this measurement.",
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [ended, measurementId, mode, relationshipId, timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  /** After a conflict: refetch what is saved and start from it (unsaved edits are dropped). */
  async function reload() {
    setFailure(null);
    setFormProblem(null);
    frozen.reset();
    setNotice("Reloaded the latest saved measurement. Your unsaved changes were discarded.");
    await load();
  }

  const entryDate = measurement
    ? formatLocalDate(new Date(measurement.observedAt), timezone)
    : null;
  const parsedValue = parseMeasurementValue(valueText);
  const dateChanged = mode === "edit" && entryDate !== null && selectedDate !== entryDate;
  const valueChanged =
    mode === "edit" && measurement !== null && parsedValue !== null && parsedValue !== measurement.value;
  const entryOutsideWindow =
    mode === "edit" && entryDate !== null && !isWithinWindow(entryDate, today);
  const fromCheckin =
    mode === "edit" && measurement !== null && (measurement.source === "checkin" || measurement.checkinId !== null);
  const editable = mode === "create" || (measurement !== null && !entryOutsideWindow && !fromCheckin);
  const canSave =
    online &&
    !saving &&
    editable &&
    (mode === "create" || valueChanged || dateChanged);
  const reloadNeeded = isReloadFailure(failure);
  const unit = unitFor(type);
  // Edit keeps Save off until the value is valid and changed; say why when the
  // value was emptied or is not a number, instead of a silently dead button.
  const editValueHint =
    mode === "edit" && editable && !saving && !formProblem && parsedValue === null
      ? measurementValueProblem(valueText)
      : null;

  async function save() {
    if (!canSave) return;
    const problem = measurementValueProblem(valueText);
    if (problem || parsedValue === null) {
      setFormProblem(problem ?? "Enter the measurement.");
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      if (mode === "create") {
        // The fingerprint is the form, not the request: observedAt for today is
        // "now" and would differ per attempt. Key and body are renewed together.
        const request = frozen.take(
          JSON.stringify({ kind: "create", type, value: parsedValue, day: selectedDate }),
          () => ({
            kind: "create",
            body: {
              type,
              value: parsedValue,
              unit: unitFor(type),
              observedAt: performedAtFor(selectedDate, timezone),
            },
          }),
        );
        if (request.body.kind !== "create") return;
        await apiClient.createMeasurement(relationshipId, request.body.body, request.key);
        navigate(progressHref);
      } else if (measurement) {
        const request = frozen.take(
          JSON.stringify({
            kind: "edit",
            version: measurement.recordVersion,
            value: parsedValue,
            day: selectedDate,
          }),
          () => ({
            kind: "edit",
            body: buildMeasurementEdit({
              recordVersion: measurement.recordVersion,
              value: parsedValue,
              initialValue: measurement.value,
              observedAt: dateChanged ? performedAtFor(selectedDate, timezone) : null,
            }),
          }),
        );
        if (request.body.kind !== "edit") return;
        await patchClientMeasurement(measurement.id, request.body.body);
        navigate(progressHref);
      }
    } catch (err) {
      setFailure(classifyFailure(err, "LOG-MEASURE"));
      setSaving(false);
    }
  }

  const title = mode === "create" ? "Log measurement" : "Edit measurement";
  const head = <EntryHead title={title} clientName={clientName} backTo={progressHref} />;

  if (ended) {
    return (
      <EndedState
        testId="log-measurement-ended"
        head={head}
        first={first}
        gender={header?.traineeProfile.gender}
        relationshipId={relationshipId}
        what="measurements"
      />
    );
  }

  if (loading) {
    return (
      <div className="lw-page">
        {head}
        <LoadingBlock label="Loading measurement…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lw-page">
        {head}
        <ErrorState message={loadError} onRetry={() => void load()} screenId="TW-18" />
      </div>
    );
  }

  const tag = measurement ? coachEntryTag(measurement, timezone) : null;

  return (
    <div className="lw-page" data-testid="log-measurement-page">
      {head}

      {notice && !failure ? (
        <div className="lw-banner" role="status" data-testid="log-measurement-notice">
          <IconCalendar />
          <p>{notice}</p>
        </div>
      ) : null}

      {failure ? (
        <FailureBanner
          failure={failure}
          testId="log-measurement-not-saved"
          screen="LOG-MEASURE"
        />
      ) : null}

      {tag ? (
        <p className="le-tag" data-testid="log-measurement-tag">
          <strong>{tag}</strong>
        </p>
      ) : null}

      {fromCheckin ? (
        <div className="lw-banner" data-testid="log-measurement-checkin">
          <IconCalendar />
          <p>
            This measurement came from {first}’s check-in, so it can’t be edited. A check-in is
            what {first} answered, and the review is about those answers.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="le-measure-label">
        <h2 className="lw-eyebrow" id="le-measure-label">
          Measurement
        </h2>
        {mode === "create" ? (
          <div className="le-choices" role="group" aria-labelledby="le-measure-label">
            {MEASUREMENT_TYPES.map((row) => (
              <button
                key={row.type}
                type="button"
                className="le-choice"
                aria-pressed={type === row.type}
                disabled={saving}
                onClick={() => {
                  setType(row.type);
                  setFormProblem(null);
                  setFailure(null);
                }}
              >
                {labelFor("measurement_type", row.type)}
              </button>
            ))}
          </div>
        ) : (
          <p className="le-tag">
            <strong>{labelFor("measurement_type", type)}</strong>
          </p>
        )}
        <div className="le-field" style={{ marginTop: 14 }}>
          <label htmlFor="le-value">Value</label>
          <div className="le-value">
            <input
              id="le-value"
              inputMode="decimal"
              value={valueText}
              disabled={saving || !editable}
              aria-invalid={formProblem || editValueHint ? true : undefined}
              aria-describedby={editValueHint ? "le-value-hint" : undefined}
              onChange={(event) => {
                setValueText(event.target.value.trim());
                setFormProblem(null);
              }}
            />
            <em>{unit}</em>
          </div>
          {editValueHint ? (
            <p className="le-hint" id="le-value-hint" role="status" data-testid="log-measurement-value-hint">
              {editValueHint}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="le-date-label">
        <h2 className="lw-eyebrow" id="le-date-label">
          Date · up to {LOG_WINDOW_DAYS} days back
        </h2>
        <DayChips
          today={today}
          selected={selectedDate}
          disabled={saving || !editable}
          onPick={(date) => {
            setSelectedDate(date);
            setFailure(null);
            setNotice(null);
          }}
        />
        {selectedDate === earliest && editable ? (
          <div className="lw-banner" data-testid="log-measurement-date-limit">
            <IconCalendar />
            <p>
              You can {mode === "create" ? "log" : "edit"} up to {LOG_WINDOW_DAYS} days back, so{" "}
              {formatCivilDate(earliest)} is the earliest. Older measurements can’t be{" "}
              {mode === "create" ? "added" : "changed"}.
            </p>
          </div>
        ) : null}
        {entryOutsideWindow && entryDate ? (
          <div className="lw-banner" data-testid="log-measurement-date-limit">
            <IconCalendar />
            <p>
              This measurement is dated {formatCivilDate(entryDate)}. You can edit up to{" "}
              {LOG_WINDOW_DAYS} days back, so {formatCivilDate(earliest)} is the earliest. Older
              measurements can’t be changed.
            </p>
          </div>
        ) : null}
      </section>

      {formProblem ? (
        <p className="form-error" role="alert" data-testid="log-measurement-problem">
          {formProblem}
        </p>
      ) : null}

      {editable ? (
        <div className="lw-actions">
          <Button
            variant="primary"
            className="lw-save"
            disabled={reloadNeeded ? !online || saving : !canSave}
            aria-busy={saving}
            onClick={() => (reloadNeeded ? void reload() : void save())}
          >
            {saving
              ? "Saving…"
              : reloadNeeded
                ? "Reload"
                : failure
                  ? "Try again"
                  : "Save measurement"}
          </Button>
        </div>
      ) : (
        <div className="lw-actions">
          <Link className="button-secondary" to={progressHref}>
            Back to progress
          </Link>
        </div>
      )}
      {!online ? (
        <p className="muted" role="status">
          You’re offline. Saving is unavailable until you reconnect.
        </p>
      ) : null}
    </div>
  );
}
