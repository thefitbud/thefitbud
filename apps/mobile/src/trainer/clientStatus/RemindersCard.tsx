import { StyleSheet, View } from "react-native";
import type { ResponsivenessResponse } from "@fitbud/contracts";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { quietHoursLine, reminderLine } from "./model";

/** Read-only summary of how the client responds to reminders (TW-31 headline). */
export function RemindersCard({
  data,
  failed,
}: {
  data: ResponsivenessResponse | null;
  failed: boolean;
}) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  title: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18 },
  line: { color: colors.nearBlack, fontSize: 15, lineHeight: 21, marginTop: 6 },
  sub: { color: colors.midGrey, fontSize: 13, marginTop: 4 },
});
