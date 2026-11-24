import { View } from "react-native";
import { Eye } from "lucide-react-native";
import { StatusChip } from "../../components/StatusChip";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { formatAttentionAge } from "../attentionCards";
import type { ReviewSheetCardModel } from "../reviewSheetContent";

/** Nothing was logged: the card shows no Logged row rather than a filler. */
const NOTHING_LOGGED = "Nothing logged";

type RowLabel = "Planned" | "Logged" | "Reminder";

/** Planned, Logged and Reminder rows; an empty one is left out, never "—". */
export function reviewCardRows(
  card: Pick<ReviewSheetCardModel, "planned" | "logged" | "reminder">,
): Array<{ label: RowLabel; value: string }> {
  const rows: Array<{ label: RowLabel; value: string }> = [];
  const add = (label: RowLabel, value: string | null) => {
    const text = value?.trim();
    if (text && text !== "—" && text !== NOTHING_LOGGED) {
      rows.push({ label, value: text });
    }
  };
  add("Planned", card.planned);
  add("Logged", card.logged);
  add("Reminder", card.reminder);
  return rows;
}

type Props = {
  card: ReviewSheetCardModel;
  /** Shows the "Noted" chip next to the severity (the item is still open). */
  noted?: boolean;
  /** Hides the severity chip and age on a resolved item. */
  resolved?: boolean;
  muted?: boolean;
};

/**
 * One review card for the review sheet and the exception screen (D-W14-29):
 * severity and age, title, what happened, then the rows that have a value.
 */
export function ReviewCard({
  card,
  noted = false,
  resolved = false,
  muted,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const rows = reviewCardRows(card);
  return (
    <View
      style={[styles.card, muted ? styles.muted : null]}
      testID="review-card"
    >
      {!resolved ? (
        <View style={styles.meta}>
          <StatusChip kind="severity" value={card.severity} />
          {noted ? (
            <View style={styles.notedChip} accessibilityLabel="Noted">
              <Eye size={14} color={theme.colors.ink2} strokeWidth={2} />
              <Text variant="caption" tone="ink2">
                Noted
              </Text>
            </View>
          ) : null}
          <Text variant="caption">{formatAttentionAge(card.ageMinutes)}</Text>
        </View>
      ) : null}
      <Text variant="headline">{card.title}</Text>
      {card.body ? (
        <Text variant="subhead" tone="ink2">
          {card.body}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.kv}>
          {rows.map((row) => (
            <View key={row.label} style={styles.kvRow}>
              <Text variant="subhead" tone="ink3" style={styles.kvLabel}>
                {row.label}
              </Text>
              <Text variant="subhead" tone="ink" style={styles.kvValue}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    padding: t.spacing.md,
    gap: t.spacing.sm,
    marginBottom: t.spacing.sm,
  },
  muted: { opacity: 0.8 },
  meta: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
  notedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 4,
  },
  kv: { marginTop: t.spacing.xs, gap: 6 },
  kvRow: { flexDirection: "row", gap: t.spacing.md },
  kvLabel: { width: 96 },
  kvValue: { flex: 1 },
}));
