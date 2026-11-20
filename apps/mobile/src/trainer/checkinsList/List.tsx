import { Pressable, StyleSheet, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
} from "lucide-react-native";
import { v3LightColors } from "@fitbud/tokens";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";
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
  onNudge: (row: CheckinListRow) => void;
  /** Swipe-right shortcut on To review (TM-05a / TM-06c). */
  onMarkReviewed?: (row: CheckinListRow) => void;
  /** Optional footer under the list (reminders paused, swipe hint). */
  footerHint?: string | null;
};

export function CheckinsList({
  loading,
  model,
  segment,
  onSegmentChange,
  onReview,
  onNudge,
  onMarkReviewed,
  footerHint,
}: Props) {
  const rows =
    segment === "to_review"
      ? model.toReview
      : segment === "overdue"
        ? model.overdue
        : model.reviewed;
  const count = (n: number) => (loading ? "" : ` · ${n}`);
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
        <Tab
          label="Reviewed"
          selected={segment === "reviewed"}
          onPress={() => onSegmentChange("reviewed")}
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
                onNudge={onNudge}
                onMarkReviewed={onMarkReviewed}
              />
            </View>
          ))}
        </View>
      )}
      {!loading && footerHint ? (
        <Text style={styles.hint}>{footerHint}</Text>
      ) : !loading &&
        segment === "to_review" &&
        rows.length > 0 &&
        onMarkReviewed ? (
        <Text style={styles.hint}>
          Swipe right on a row to mark it reviewed.
        </Text>
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
  onNudge,
  onMarkReviewed,
}: {
  row: CheckinListRow;
  segment: CheckinListSegment;
  onReview: (row: CheckinListRow) => void;
  onNudge: (row: CheckinListRow) => void;
  onMarkReviewed?: (row: CheckinListRow) => void;
}) {
  const tone = avatarTone(row.name);
  const overdue = segment === "overdue";
  const reviewed = segment === "reviewed";
  const openable = !overdue;

  const body = (
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
          {reviewed ? (
            <View style={[styles.chip, styles.chipReviewed]}>
              <Check color={v3LightColors.done} size={13} strokeWidth={2.6} />
              <Text style={[styles.chipText, { color: v3LightColors.done }]}>
                Reviewed
              </Text>
            </View>
          ) : overdue ? (
            <View style={[styles.chip, styles.chipOverdue]}>
              <Clock3 color={v3LightColors.warn} size={13} strokeWidth={2.2} />
              <Text style={[styles.chipText, { color: v3LightColors.warn }]}>
                Overdue
              </Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.chipReview]}>
              <ClipboardCheck
                color={v3LightColors.info}
                size={13}
                strokeWidth={2.2}
              />
              <Text style={[styles.chipText, { color: v3LightColors.info }]}>
                To review
              </Text>
            </View>
          )}
          {row.age ? <Text style={styles.age}>{row.age}</Text> : null}
          {overdue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Nudge ${row.name}`}
              onPress={() => onNudge(row)}
              style={styles.nudge}
            >
              <Text style={styles.nudgeText}>Nudge</Text>
            </Pressable>
          ) : (
            <ChevronRight color={colors.midGrey} size={18} />
          )}
        </View>
      </View>
    </View>
  );

  const openableRow = openable ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        reviewed
          ? `Open ${row.name}'s reviewed check-in`
          : `Review ${row.name}'s check-in`
      }
      onPress={() => onReview(row)}
    >
      {body}
    </Pressable>
  ) : (
    body
  );

  if (segment === "to_review" && onMarkReviewed) {
    return (
      <Swipeable
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={() => (
          <View style={styles.swipeDone}>
            <Check color={colors.white} size={22} strokeWidth={2.4} />
            <Text style={styles.swipeDoneText}>Reviewed</Text>
          </View>
        )}
        onSwipeableOpen={(direction) => {
          if (direction === "left") onMarkReviewed(row);
        }}
      >
        {openableRow}
      </Swipeable>
    );
  }

  return openableRow;
}

function Empty({ segment }: { segment: CheckinListSegment }) {
  const copy = emptyCopy(segment);
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Check color={v3LightColors.ink} size={28} strokeWidth={2.4} />
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
              <View
                style={[styles.block, { height: 12, width: "86%", marginTop: 10 }]}
              />
              <View
                style={[styles.block, { height: 20, width: "36%", marginTop: 10 }]}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: v3LightColors.fill,
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
    paddingHorizontal: 4,
  },
  tabOn: {
    backgroundColor: colors.white,
    shadowColor: "#1B1650",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  tabText: {
    color: colors.midGrey,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
    textAlign: "center",
  },
  tabTextOn: { color: colors.deepNavy },
  card: {
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: { backgroundColor: v3LightColors.line, height: StyleSheet.hairlineWidth },
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
  name: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 17 },
  line: { color: colors.midGrey, fontSize: 14, lineHeight: 20, marginTop: 2 },
  foot: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipReview: { backgroundColor: v3LightColors.infoTint },
  chipOverdue: { backgroundColor: v3LightColors.warnTint },
  chipReviewed: { backgroundColor: v3LightColors.doneTint },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  age: { color: colors.midGrey, flex: 1, fontSize: 13 },
  nudge: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  nudgeText: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 14,
    marginTop: 14,
    textAlign: "center",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 18,
    height: 56,
    justifyContent: "center",
    marginBottom: 8,
    width: 56,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    textAlign: "center",
  },
  emptyBody: {
    color: colors.midGrey,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  block: { backgroundColor: v3LightColors.skel1, borderRadius: 999 },
  srOnly: { height: 1, overflow: "hidden", position: "absolute", width: 1 },
  swipeDone: {
    alignItems: "center",
    backgroundColor: v3LightColors.done,
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
  },
  swipeDoneText: {
    color: colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
});
