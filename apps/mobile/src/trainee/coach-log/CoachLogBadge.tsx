import { StyleSheet, View } from "react-native";
import { UserCheck } from "lucide-react-native";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { coachLogLabel, type CoachLogRoles } from "./coachLogLabel";

type Props = CoachLogRoles & {
  /** The entry's `updatedAt`; shown as the date on an "Edited" label. */
  editedAt?: string | null;
  timeZone: string;
};

/** Shared label for coach-logged and coach-edited meal and measurement entries. */
export function CoachLogBadge({ editedAt, timeZone, ...roles }: Props) {
  const label = coachLogLabel(roles, editedAt, timeZone);
  if (!label) return null;
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <UserCheck size={14} color={colors.indigo} strokeWidth={2} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same colours as the Z9-11 workout banner: indigo on pale lavender.
  row: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.paleLavender,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: { color: colors.indigo, fontFamily: fontFamilySemiBold, fontSize: 12 },
});
