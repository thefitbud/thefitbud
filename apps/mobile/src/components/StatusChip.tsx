import { View } from "react-native";
import { Text } from "./Text";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
} from "lucide-react-native";
import { labelFor, sentenceCaseEnum, type LabelNamespace } from "@fitbud/core";
import type { ColorToken } from "@fitbud/tokens";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/** Status colour pairs (DESIGN-SYSTEM-v3 §5 Trainer: v2 hues at v3 values). Always icon + word, never colour alone. */
const TONE_TOKENS: Record<Tone, { fill: ColorToken; text: ColorToken }> = {
  critical: { fill: "critTint", text: "crit" },
  attention: { fill: "warnTint", text: "warn" },
  positive: { fill: "doneTint", text: "done" },
  info: { fill: "infoTint", text: "info" },
  neutral: { fill: "fill", text: "ink2" },
};

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
  const theme = useTheme();
  const styles = useStyles();
  const fill = theme.colors[TONE_TOKENS[tone].fill];
  const text = theme.colors[TONE_TOKENS[tone].text];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: fill },
      ]}
    >
      <Icon size={14} color={text} strokeWidth={1.75} />
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

/** Kit `.sch` severity chip: 22 pt, 7 pt corners, 12/600. */
const useStyles = createThemedStyles((t) => ({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    minHeight: 22,
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: t.colors.ink2,
  },
}));
