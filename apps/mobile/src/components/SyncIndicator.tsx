import { Pressable } from "react-native";
import { CloudAlert, CloudOff, CloudUpload } from "lucide-react-native";
import type { ColorToken } from "@fitbud/tokens";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { pillFromStatus, type IndicatorKind } from "../sync/outboxCopy";
import { useSyncView } from "../sync/useSyncStatus";

type Props = {
  onPress?: () => void;
};

/** Kit sync chips: the v2 status hues at v3 values (DESIGN-SYSTEM-v3 §5). */
const TONES: Record<
  Exclude<IndicatorKind, "synced">,
  { fill: ColorToken; ink: ColorToken }
> = {
  waiting: { fill: "warnTint", ink: "warn" },
  syncing: { fill: "infoTint", ink: "info" },
  problem: { fill: "critTint", ink: "crit" },
};

/**
 * The sync pill (Z12-41). It shows the outbox's real state and nothing else:
 * "Saved on phone" while a log waits, "Sending…" while a request is in
 * flight, "Couldn't send" when the server refused one. With an empty outbox
 * there is no pill. Always an icon and a word, never colour alone.
 */
export function SyncIndicator({ onPress }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const view = useSyncView();
  const pill = view ? pillFromStatus(view.status) : null;
  if (!pill || pill.kind === "synced") return null;

  const tone = TONES[pill.kind];
  const color = theme.colors[tone.ink];
  const Icon =
    pill.kind === "syncing"
      ? CloudUpload
      : pill.kind === "problem"
        ? CloudAlert
        : CloudOff;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status, ${pill.label}`}
      onPress={onPress}
      // A 32 pt chip with a 44 pt tap target.
      hitSlop={6}
      style={[styles.pill, { backgroundColor: theme.colors[tone.fill] }]}
    >
      <Icon color={color} size={16} strokeWidth={2} />
      <Text variant="caption" style={[styles.label, { color }]}>
        {pill.label}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  pill: {
    alignItems: "center",
    borderRadius: t.radii.pill,
    flexDirection: "row",
    gap: 5,
    height: 32,
    paddingHorizontal: t.spacing.md,
  },
  label: {
    fontWeight: "600",
  },
}));
