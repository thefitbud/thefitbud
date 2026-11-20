import { View } from "react-native";
import type { ResponsivenessResponse } from "@fitbud/contracts";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { quietHoursLine, reminderLine } from "./model";
import { createThemedStyles } from "../../providers/ThemeProvider";

/** Read-only summary of how the client responds to reminders (TW-31 headline). */
export function RemindersCard({
  data,
  failed,
}: {
  data: ResponsivenessResponse | null;
  failed: boolean;
}) {

  const styles = useStyles();
  if (!data && !failed) return null;
  const quiet = data ? quietHoursLine(data) : null;
  return (
    <View style={styles.card} accessibilityLabel="Reminders">
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.line}>
        {data ? reminderLine(data) : "Couldn't load reminders."}
      </Text>
      {quiet ? <Text style={styles.sub}>{quiet}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  title: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 18 },
  line: { color: t.colors.ink, fontSize: 15, lineHeight: 21, marginTop: 6 },
  sub: { color: t.colors.ink3, fontSize: 13, marginTop: 4 },
}));
