import { Platform, Pressable, StyleSheet, View } from "react-native";
import { ClipboardCheck, Clock3 } from "lucide-react-native";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { initialsFromName, WhatsAppGlyph } from "../../components/m2";
import {
  emptyCopy,
  type CheckinListModel,
  type CheckinListRow,
  type CheckinListSegment,
} from "./model";

const AVATARS = [
  { backgroundColor: "#FDECEF", color: "#A3243F" },
  { backgroundColor: "#E3EEFD", color: "#1E4B9E" },
  { backgroundColor: "#EAF5E4", color: "#2F6B1E" },
  { backgroundColor: "#FFF1DB", color: "#8A4B06" },
  { backgroundColor: "#E9E5FF", color: "#3B23A8" },
  { backgroundColor: "#F1E8FA", color: "#6B2A93" },
] as const;

function avatarTone(name: string): (typeof AVATARS)[number] {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0];
}

type Props = {
  loading: boolean;
  model: CheckinListModel;
  segment: CheckinListSegment;
  onSegmentChange: (segment: CheckinListSegment) => void;
  onReview: (row: CheckinListRow) => void;
  onWhatsApp: (row: CheckinListRow) => void;
};

export function CheckinsList({
  loading,
  model,
  segment,
  onSegmentChange,
  onReview,
  onWhatsApp,
}: Props) {
  const rows = segment === "to_review" ? model.toReview : model.overdue;
  const count = (n: number) => (loading ? "" : ` ${n}`);
  return (
    <View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        <Tab
          label={`To review${count(model.toReview.length)}`}
          selected={segment === "to_review"}
          onPress={() => onSegmentChange("to_review")}
        />
        <Tab
          label={`Overdue${count(model.overdue.length)}`}
          selected={segment === "overdue"}
          onPress={() => onSegmentChange("overdue")}
        />
      </View>

      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty segment={segment} />
      ) : (
        <View style={styles.card}>
          {rows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Row
                row={row}
                segment={segment}
                onReview={onReview}
                onWhatsApp={onWhatsApp}
              />
            </View>
          ))}
        </View>
      )}
      {!loading &&
      Platform.OS !== "android" &&
      segment === "to_review" &&
      rows.length > 0 ? (
        <Text style={styles.hint}>Pull down to check for new check-ins</Text>
      ) : null}
    </View>
  );
}

function Tab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected ? styles.tabOn : null]}
    >
      <Text style={[styles.tabText, selected ? styles.tabTextOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({
  row,
  segment,
  onReview,
  onWhatsApp,
}: {
  row: CheckinListRow;
  segment: CheckinListSegment;
  onReview: (row: CheckinListRow) => void;
  onWhatsApp: (row: CheckinListRow) => void;
}) {
  const tone = avatarTone(row.name);
  const overdue = segment === "overdue";
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.avatarText, { color: tone.color }]}>
          {initialsFromName(row.name)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.line}>{row.line}</Text>
        <View style={styles.foot}>
          {overdue ? (
            <View style={[styles.chip, styles.chipOverdue]}>
              <Clock3 color="#B45309" size={14} />
              <Text style={[styles.chipText, { color: "#B45309" }]}>Overdue</Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.chipReview]}>
              <ClipboardCheck color="#1D4ED8" size={14} />
              <Text style={[styles.chipText, { color: "#1D4ED8" }]}>
                To review
              </Text>
            </View>
          )}
          {overdue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`WhatsApp ${row.name}`}
              onPress={() => onWhatsApp(row)}
              style={[styles.action, styles.actionQuiet]}
            >
              <WhatsAppGlyph size={20} />
              <Text style={styles.actionQuietText}>WhatsApp</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Review ${row.name}'s check-in`}
              onPress={() => onReview(row)}
              style={[styles.action, styles.actionPrimary]}
            >
              <Text style={styles.actionPrimaryText}>Review</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function Empty({ segment }: { segment: CheckinListSegment }) {
  const copy = emptyCopy(segment);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <ClipboardCheck color="#047857" size={32} />
      </View>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      {copy.body ? <Text style={styles.emptyBody}>{copy.body}</Text> : null}
    </View>
  );
}

/** Static blocks: motion is for state change, not for waiting. */
function Skeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Loading check-ins">
      <Text style={styles.srOnly}>Loading check-ins…</Text>
      {[0, 1, 2].map((i) => (
        <View key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.row}>
            <View style={[styles.avatar, styles.block]} />
            <View style={styles.body}>
              <View style={[styles.block, { height: 14, width: "52%" }]} />
              <View style={[styles.block, { height: 12, width: "86%", marginTop: 10 }]} />
              <View style={[styles.block, { height: 20, width: "36%", marginTop: 10 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: "#EDEAFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 2,
    marginBottom: 16,
    marginTop: 12,
    padding: 3,
  },
  tab: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  tabOn: { backgroundColor: colors.white },
  tabText: { color: colors.midGrey, fontSize: 15, fontFamily: fontFamilySemiBold },
  tabTextOn: { color: colors.deepNavy },
  card: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: { backgroundColor: "#E7E9F2", height: 1 },
  row: { flexDirection: "row", gap: 12, padding: 14 },
  avatar: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 14 },
  body: { flex: 1, minWidth: 0 },
  name: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 18 },
  line: { color: colors.midGrey, fontSize: 15, lineHeight: 21, marginTop: 2 },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 10,
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipReview: { backgroundColor: "#EEF4FF", borderColor: "#C7DAFB" },
  chipOverdue: { backgroundColor: "#FFF5DC", borderColor: "#F8DFA4" },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 14 },
  action: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: 18,
  },
  actionPrimary: { backgroundColor: "#EDEAFF" },
  actionPrimaryText: {
    color: colors.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  actionQuiet: {
    backgroundColor: colors.white,
    borderColor: "#DAD8EA",
    borderWidth: 1,
  },
  actionQuietText: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 15,
    marginTop: 20,
    textAlign: "center",
  },
  empty: { alignItems: "center", gap: 8, paddingHorizontal: 24, paddingTop: 56 },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 28,
    height: 88,
    justifyContent: "center",
    marginBottom: 16,
    width: 88,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 26,
    textAlign: "center",
  },
  emptyBody: {
    color: colors.midGrey,
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  block: { backgroundColor: "#EDEBF5", borderRadius: 999 },
  srOnly: { height: 1, overflow: "hidden", position: "absolute", width: 1 },
});
