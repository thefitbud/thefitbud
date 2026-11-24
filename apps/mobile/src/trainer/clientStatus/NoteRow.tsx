import { View } from "react-native";
import { Eye, Lock } from "lucide-react-native";
import type { TrainerNote } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

/** "Aarav sees it" or "Only you": the mark never relies on the icon alone. */
export function noteVisibilityText(
  visibility: TrainerNote["visibility"],
  first: string,
): string {
  if (visibility === "client") return first ? `${first} sees it` : "Client sees it";
  return "Only you";
}

/** One coach note (TM-03b3, TM-03k): who can see it, the date, then the text. */
export function NoteRow({ note, first }: { note: TrainerNote; first: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const Icon = note.visibility === "client" ? Eye : Lock;
  return (
    <View style={styles.block} testID="note-row">
      <View style={styles.meta}>
        <Icon color={theme.colors.ink3} size={13} strokeWidth={2.2} />
        <Text style={styles.metaText}>
          {`${noteVisibilityText(note.visibility, first)} · ${formatCivilDate(note.createdAt.slice(0, 10))}`}
        </Text>
      </View>
      <Text style={styles.body}>{note.body}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  block: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    gap: 4,
    marginTop: 8,
    padding: 12,
  },
  meta: { alignItems: "center", flexDirection: "row", gap: 5 },
  metaText: { color: t.colors.ink3, fontSize: 12, lineHeight: 16 },
  body: { color: t.colors.ink, fontSize: 15, lineHeight: 21 },
}));
