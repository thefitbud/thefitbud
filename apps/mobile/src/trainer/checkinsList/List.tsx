import { Pressable, StyleSheet, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
} from "lucide-react-native";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { ClientAvatar } from "../ClientAvatar";
import {
  emptyCopy,
  type CheckinListModel,
  type CheckinListRow,
  type CheckinListSegment,
} from "./model";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

function avatars(c: ColorTokens) {
  return [
    { backgroundColor: c.av1Bg, color: c.av1Fg },
    { backgroundColor: c.av2Bg, color: c.av2Fg },
    { backgroundColor: c.av3Bg, color: c.av3Fg },
    { backgroundColor: c.av4Bg, color: c.av4Fg },
    { backgroundColor: c.av5Bg, color: c.av5Fg },
    { backgroundColor: c.av6Bg, color: c.av6Fg },
  ] as const;
}

function avatarTone(name: string, c: ColorTokens) {
  const list = avatars(c);
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return list[code % list.length] ?? list[0];
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
  /** Avatar tap: opens the client's profile (Z14-19). */
  onOpenClient?: (relationshipId: string) => void;
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
  onOpenClient,
  footerHint,
}: Props) {

  const styles = useStyles();
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
          testID="checkins-segment-to-review"
          label={`To review${count(model.toReview.length)}`}
          selected={segment === "to_review"}
          onPress={() => onSegmentChange("to_review")}
        />
        <Tab
          testID="checkins-segment-overdue"
          label={`Overdue${count(model.overdue.length)}`}
          selected={segment === "overdue"}
          onPress={() => onSegmentChange("overdue")}
        />
        <Tab
          testID="checkins-segment-reviewed"
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
                onOpenClient={onOpenClient}
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
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {

  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
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
  onOpenClient,
}: {
  row: CheckinListRow;
  segment: CheckinListSegment;
  onReview: (row: CheckinListRow) => void;
  onNudge: (row: CheckinListRow) => void;
  onMarkReviewed?: (row: CheckinListRow) => void;
  onOpenClient?: ((relationshipId: string) => void) | undefined;
}) {

  const theme = useTheme();
  const styles = useStyles();
  const tone = avatarTone(row.name, theme.colors);
  const overdue = segment === "overdue";
  const reviewed = segment === "reviewed";
  const openable = !overdue;

  // The avatar is its own button, a sibling of the row body (not inside it),
  // so there are no nested buttons on web.
  const avatar = (
    <ClientAvatar
      name={row.name}
      size={48}
      fontSize={14}
      tone={tone}
      onPress={
        onOpenClient
          ? () => onOpenClient(row.item.coachingRelationshipId)
          : undefined
      }
    />
  );

  const content = (
    <>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.line}>{row.line}</Text>
        <View style={styles.foot}>
          {reviewed ? (
            <View style={[styles.chip, styles.chipReviewed]}>
              <Check color={theme.colors.done} size={13} strokeWidth={2.6} />
              <Text style={[styles.chipText, { color: theme.colors.done }]}>
                Reviewed
              </Text>
            </View>
          ) : overdue ? (
            <View style={[styles.chip, styles.chipOverdue]}>
              <Clock3 color={theme.colors.warn} size={13} strokeWidth={2.2} />
              <Text style={[styles.chipText, { color: theme.colors.warn }]}>
                Overdue
              </Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.chipReview]}>
              <ClipboardCheck
                color={theme.colors.info}
                size={13}
                strokeWidth={2.2}
              />
              <Text style={[styles.chipText, { color: theme.colors.info }]}>
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
            <ChevronRight color={theme.colors.ink3} size={18} />
          )}
        </View>
    </>
  );

  const openableRow = (
    <View style={styles.row}>
      {avatar}
      {openable ? (
        <Pressable
          testID="checkin-row"
          accessibilityRole="button"
          accessibilityLabel={
            reviewed
              ? `Open ${row.name}'s reviewed check-in`
              : `Review ${row.name}'s check-in`
          }
          onPress={() => onReview(row)}
          style={styles.body}
        >
          {content}
        </Pressable>
      ) : (
        <View testID="checkin-row" style={styles.body}>
          {content}
        </View>
      )}
    </View>
  );

  if (segment === "to_review" && onMarkReviewed) {
    return (
      <Swipeable
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={() => (
          <View style={styles.swipeDone}>
            <Check color={theme.colors.card} size={22} strokeWidth={2.4} />
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

  const theme = useTheme();
  const styles = useStyles();
  const copy = emptyCopy(segment);
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Check color={theme.colors.ink} size={28} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      {copy.body ? <Text style={styles.emptyBody}>{copy.body}</Text> : null}
    </View>
  );
}

/** Static blocks: motion is for state change, not for waiting. */
function Skeleton() {

  const styles = useStyles();
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

const useStyles = createThemedStyles((t) => ({
  tabs: {
    backgroundColor: t.colors.fill,
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
    backgroundColor: t.colors.card,
    shadowColor: "#1B1650",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  tabText: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
    textAlign: "center",
  },
  tabTextOn: { color: t.colors.ink },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: { backgroundColor: t.colors.line, height: StyleSheet.hairlineWidth },
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
  name: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 17 },
  line: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, marginTop: 2 },
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
  chipReview: { backgroundColor: t.colors.infoTint },
  chipOverdue: { backgroundColor: t.colors.warnTint },
  chipReviewed: { backgroundColor: t.colors.doneTint },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  age: { color: t.colors.ink3, flex: 1, fontSize: 13 },
  nudge: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  nudgeText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  hint: {
    color: t.colors.ink3,
    fontSize: 14,
    marginTop: 14,
    textAlign: "center",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 18,
    height: 56,
    justifyContent: "center",
    marginBottom: 8,
    width: 56,
  },
  emptyTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    textAlign: "center",
  },
  emptyBody: {
    color: t.colors.ink3,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  block: { backgroundColor: t.colors.skel1, borderRadius: 999 },
  srOnly: { height: 1, overflow: "hidden", position: "absolute", width: 1 },
  swipeDone: {
    alignItems: "center",
    backgroundColor: t.colors.done,
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
  },
  swipeDoneText: {
    color: t.colors.card,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
}));
