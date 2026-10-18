import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
} from "lucide-react-native";
import { labelFor, sentenceCaseEnum, type LabelNamespace } from "@fitbud/core";
import { fontFamilySemiBold, radii, semanticColors, spacing } from "@fitbud/ui-mobile";

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

type Tone = "critical" | "attention" | "positive" | "info" | "neutral";

/** @deprecated Prefer kind+value API. */
type LegacyTone = "neutral" | "positive" | "attention" | "warning";

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

function toneFor(kind: StatusChipKind, value: string): Tone {
  if (kind === "severity") {
    return value === "critical" ? "critical" : "attention";
  }
  if (kind === "adherence") {
    if (value === "on_track") return "positive";
    if (value === "needs_attention") return "attention";
    return "neutral";
  }
  if (value === "overdue" || value === "critical") return "attention";
  if (value === "on_track" || value === "answered" || value === "reviewed") {
    return "positive";
  }
  if (kind === "ask") return "info";
  return "neutral";
}

type Props =
  | {
      kind: StatusChipKind;
      value: string;
      label?: string;
      tone?: never;
    }
  | {
      /** Legacy tone-only API — maps warning→attention colours. */
      label: string;
      tone?: LegacyTone;
      kind?: never;
      value?: never;
    };

export function StatusChip(props: Props) {
  if ("kind" in props && props.kind) {
    const namespace = KIND_NAMESPACE[props.kind];
    const text =
      props.label ??
      (namespace
        ? labelFor(namespace, props.value)
        : sentenceCaseEnum(props.value));
    const tone = toneFor(props.kind, props.value);
    return <ChipVisual label={text} tone={tone} />;
  }

  const legacyTone = props.tone ?? "neutral";
  const tone: Tone =
    legacyTone === "warning" ? "attention" : (legacyTone as Tone);
  return <ChipVisual label={props.label} tone={tone} />;
}

function ChipVisual({ label, tone }: { label: string; tone: Tone }) {
  const Icon =
    tone === "critical"
      ? AlertOctagon
      : tone === "attention"
        ? AlertTriangle
        : tone === "positive"
          ? CheckCircle2
          : tone === "info"
            ? Info
            : CircleDashed;
  const palette = semanticColors[tone === "critical" ? "critical" : tone === "attention" ? "attention" : tone === "positive" ? "positive" : tone === "info" ? "info" : "neutral"];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.fill },
      ]}
    >
      <Icon size={14} color={palette.text} strokeWidth={1.75} />
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    fontWeight: "600",
  },
});
