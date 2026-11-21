/**
 * TM-03f client info rows from workspace + intake answers + progress.
 */
import type {
  ClientWorkspace,
  OnboardingAnswers,
  OnboardingFormResponse,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";

export type InfoRow = { label: string; value: string };

function textAnswer(answers: OnboardingAnswers, id: string): string {
  const value = answers[id];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstAnswer(
  answers: OnboardingAnswers,
  ids: readonly string[],
): string {
  for (const id of ids) {
    const value = textAnswer(answers, id);
    if (value) return value;
  }
  return "";
}

export function coachingWeekNumber(
  startedAt: string | null | undefined,
  untilMs = Date.now(),
): number | null {
  if (!startedAt) return null;
  const elapsed = untilMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

export function coachingRows(input: {
  workspace: ClientWorkspace;
  startWeightKg: number | null;
  heightCm: string | null;
  nowMs?: number;
}): InfoRow[] {
  const { header, configuration } = input.workspace;
  const goal =
    configuration.configuration?.goalDescription?.trim() ||
    header.goalShort?.trim() ||
    "—";
  const week = coachingWeekNumber(header.startedAt, input.nowMs);
  const started = header.startedAt
    ? [
        formatCivilDate(header.startedAt.slice(0, 10)),
        week != null ? `week ${week}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "—";
  const height = input.heightCm?.trim() || null;
  const weight =
    input.startWeightKg != null ? `${input.startWeightKg} kg` : null;
  const heightWeight =
    height && weight
      ? `${height} · ${weight}`
      : height || weight || "—";
  return [
    { label: "Goal", value: goal },
    { label: "Started", value: started },
    { label: "Height · start weight", value: heightWeight },
  ];
}

export function limitationBlock(answers: OnboardingAnswers | null): {
  body: string;
  footer: string;
} | null {
  if (!answers) return null;
  const body = firstAnswer(answers, [
    "limitations",
    "injuries",
    "injury",
    "limitations_and_injuries",
  ]);
  if (!body || /^none\.?$/i.test(body)) return null;
  return {
    body,
    footer: "From intake",
  };
}

export function intakeRows(
  answers: OnboardingAnswers | null,
): InfoRow[] {
  if (!answers) return [];
  const diet = firstAnswer(answers, [
    "diet",
    "diet_preference",
    "eating",
    "nutrition",
  ]);
  const training = firstAnswer(answers, [
    "schedule",
    "training",
    "preferences",
  ]);
  const rows: InfoRow[] = [];
  if (diet) rows.push({ label: "Diet", value: diet });
  if (training) rows.push({ label: "Training", value: training });
  return rows;
}

export function contactRows(workspace: ClientWorkspace): InfoRow[] {
  const wa = workspace.header.clientWhatsappE164;
  const formatted = wa
    ? wa.startsWith("+")
      ? wa.replace(/^\+(\d{2})(\d+)/, "+$1 $2")
      : `+${wa}`
    : "—";
  const zone = workspace.header.traineeTimezone || "—";
  const zoneLabel =
    zone === "Asia/Kolkata" || zone === "Asia/Calcutta"
      ? "India (IST)"
      : zone;
  return [
    { label: "WhatsApp", value: formatted },
    { label: "Time zone", value: zoneLabel },
  ];
}

export function heightFromAnswers(
  answers: OnboardingAnswers | null,
): string | null {
  if (!answers) return null;
  const raw = firstAnswer(answers, ["height", "height_cm", "heightCm"]);
  if (!raw) return null;
  if (/cm/i.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw} cm`;
  return raw;
}

export function intakeSubmittedLabel(
  response: OnboardingFormResponse | null,
): string | null {
  if (!response?.submittedAt) return null;
  return `Submitted ${formatCivilDate(response.submittedAt.slice(0, 10))}`;
}

export function isOnboardingIncomplete(
  status: string | null | undefined,
): boolean {
  return (
    status === "invited" ||
    status === "onboarding_pending" ||
    status === "onboarding_submitted"
  );
}

export type OnboardingStep = {
  id: "invite" | "intake" | "plan";
  label: string;
  done: boolean;
};

export function onboardingSteps(input: {
  status: string;
  hasPlan: boolean;
}): OnboardingStep[] {
  const accepted =
    input.status !== "invited";
  const intakeDone =
    input.status === "onboarding_submitted" ||
    input.status === "coaching_ready" ||
    input.status === "active";
  return [
    { id: "invite", label: "Accepted invite", done: accepted },
    { id: "intake", label: "Intake form", done: intakeDone },
    {
      id: "plan",
      label: "Plan assigned (on web)",
      done: input.hasPlan,
    },
  ];
}

export function onboardingChipLabel(status: string): string {
  if (status === "invited") return "Invite pending";
  if (status === "onboarding_pending") return "Intake not sent";
  if (status === "onboarding_submitted") return "Intake to review";
  return "Onboarding";
}

export function onboardingWaitingCopy(input: {
  firstName: string;
  status: string;
  startedAt: string | null | undefined;
  possessive: "his" | "her" | "their";
  subject: "He" | "She" | "They";
}): { title: string; body: string } {
  const first = input.firstName;
  if (input.status === "onboarding_submitted") {
    return {
      title: `${first}'s intake is ready`,
      body: `Review ${input.possessive} answers on FitBud web, then assign a plan.`,
    };
  }
  const days = input.startedAt
    ? Math.max(
        0,
        Math.round(
          (Date.now() - Date.parse(input.startedAt)) / (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const when =
    days == null
      ? "recently"
      : days === 0
        ? "today"
        : days === 1
          ? "1 day ago"
          : `${days} days ago`;
  return {
    title: `Waiting for ${first}’s intake`,
    body: `${input.subject} accepted your invite ${when} but hasn’t sent the intake form, so you can’t plan yet.`,
  };
}
