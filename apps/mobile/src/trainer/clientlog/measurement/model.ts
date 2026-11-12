/**
 * Trainer log and edit of a client's body measurement (Z10-19). Types are the
 * contract's (weight, waist, hip, chest, other, D-W9-9); the API enforces R1
 * to R5.
 */
import {
  coachEditMeasurementRequestSchema,
  createMeasurementRequestSchema,
  measurementSchema,
  type CoachEditMeasurementRequest,
  type CreateMeasurementRequest,
  type Measurement,
  type MeasurementType,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "@fitbud/api-client";
import { localDateInTimezone } from "../../../lib/dates";

export const TYPES: MeasurementType[] = ["body_weight_kg", "waist_cm", "hip_cm", "chest_cm", "other"];

export function fixedUnit(type: MeasurementType): string | null {
  if (type === "body_weight_kg") return "kg";
  if (type === "other") return null;
  return "cm";
}

/** Accepts "72.4" and "72,4"; null for anything the API would refuse. */
export function parseValue(text: string): number | null {
  const n = Number.parseFloat(text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return Math.round(n * 100) / 100;
}

export function valueText(n: number): string {
  return String(n);
}

/** Measurements the trainer can edit: dated `date` in the client's zone, not from a check-in. */
export function measurementsOn(items: Measurement[], date: string, zone: string): Measurement[] {
  return items
    .filter((m) => m.source !== "checkin" && localDateInTimezone(zone, new Date(m.observedAt)) === date)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

export type MeasurementDraft = { type: MeasurementType; value: string; unit: string };

export function newDraft(): MeasurementDraft {
  return { type: "body_weight_kg", value: "", unit: "" };
}

export function draftFor(m: Measurement): MeasurementDraft {
  return { type: m.type, value: valueText(m.value), unit: m.unit };
}

export function unitFor(d: MeasurementDraft): string {
  return fixedUnit(d.type) ?? d.unit.trim();
}

export function isComplete(d: MeasurementDraft): boolean {
  return parseValue(d.value) != null && unitFor(d) !== "";
}

export function buildCreateBody(d: MeasurementDraft, observedAt: string): CreateMeasurementRequest {
  return createMeasurementRequestSchema.parse({
    type: d.type,
    value: parseValue(d.value),
    unit: unitFor(d),
    observedAt,
  });
}

/** Only what changed; null when nothing did. */
export function buildEditBody(d: MeasurementDraft, m: Measurement): CoachEditMeasurementRequest | null {
  const value = parseValue(d.value);
  const unit = unitFor(d);
  const body = {
    recordVersion: m.recordVersion,
    ...(value != null && value !== m.value ? { value } : {}),
    ...(unit !== "" && unit !== m.unit ? { unit } : {}),
  };
  return Object.keys(body).length > 1 ? coachEditMeasurementRequestSchema.parse(body) : null;
}

/** `PATCH /progress/measurements/:id` (Z6-20). */
export async function patchCoachMeasurement(
  api: FitBudApiClient,
  measurementId: string,
  body: CoachEditMeasurementRequest,
): Promise<Measurement> {
  return api.request("PATCH", `/progress/measurements/${encodeURIComponent(measurementId)}`, measurementSchema, {
    auth: true,
    body,
  });
}

/** "Logged by you" / "Edited by you" (R1). */
export function authorshipLabel(m: Pick<Measurement, "loggedByRole" | "lastEditedByRole">): string | null {
  if (m.lastEditedByRole === "coach") return "Edited by you";
  if (m.loggedByRole === "coach") return "Logged by you";
  return null;
}
