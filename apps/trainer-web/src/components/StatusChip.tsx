import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  type LucideIcon,
} from "lucide-react";
import { labelFor, sentenceCaseEnum, type LabelNamespace } from "@fitbud/core";

export type StatusChipKind =
  | "lifecycle"
  | "adherence"
  | "severity"
  | "checkin"
  | "renewal"
  | "meal"
  | "workout"
  | "sync"
  | "ask";

type SemanticTone =
  | "critical"
  | "attention"
  | "positive"
  | "info"
  | "neutral"
  | "brand-selected";

const KIND_NAMESPACE: Record<StatusChipKind, LabelNamespace | null> = {
  lifecycle: "onboarding_status",
  adherence: "adherence_state",
  severity: "exception_severity",
  checkin: "checkin_status",
  renewal: null,
  meal: "meal_assignment_status",
  workout: "workout_assignment_status",
  sync: null,
  ask: "coach_ask_status",
};

function toneFor(kind: StatusChipKind, value: string): SemanticTone {
  if (kind === "severity") {
    return value === "critical" ? "critical" : "attention";
  }
  if (kind === "adherence") {
    if (value === "on_track") return "positive";
    if (value === "needs_attention") return "attention";
    return "neutral";
  }
  if (kind === "lifecycle") {
    if (value === "active" || value === "coaching_ready") return "positive";
    if (value === "ended") return "neutral";
    return "info";
  }
  if (kind === "checkin") {
    if (value === "overdue") return "attention";
    if (value === "reviewed") return "positive";
    if (value === "submitted") return "info";
    return "neutral";
  }
  if (kind === "ask") {
    return value === "answered" ? "positive" : "info";
  }
  return "neutral";
}

function IconFor({ tone }: { tone: SemanticTone }): LucideIcon {
  switch (tone) {
    case "critical":
      return AlertOctagon;
    case "attention":
      return AlertTriangle;
    case "positive":
      return CheckCircle2;
    case "info":
      return Info;
    default:
      return CircleDashed;
  }
}

type Props = {
  kind: StatusChipKind;
  value: string;
  label?: string;
  className?: string;
};

/** Status chip with Lucide icon + packages/core label (foundations §1.6.3). */
export function StatusChip({ kind, value, label, className = "" }: Props) {
  const namespace = KIND_NAMESPACE[kind];
  const text =
    label ??
    (namespace ? labelFor(namespace, value) : sentenceCaseEnum(value));
  const tone = toneFor(kind, value);
  const Icon = IconFor({ tone });
  return (
    <span
      className={`status-chip status-chip-${tone} ${className}`.trim()}
      data-kind={kind}
      data-value={value}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
