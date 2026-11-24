/**
 * Needs you v3 chrome (TM-01*): summary grid, section headers, and cards.
 * Follows system light/dark via ThemeScope on `<Screen v3>` (D-W12-12).
 */
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  ArrowDown,
  CalendarX,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardCheck,
  Eye,
  HeartPulse,
  MessageCircleQuestionMark,
  Search,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilyMedium, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { SwipeActionRow } from "../../components/SwipeActionRow";
import { ClientAvatar, ClientNameLink } from "../ClientAvatar";
import {
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import type {
  NeedsYouCardModel,
  NeedsYouChipKind,
  NeedsYouPill,
  NeedsYouSection,
  NeedsYouSectionId,
  NeedsYouTile,
  NeedsYouTileId,
} from "./needsYouModel";

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

function tileIcon(
  c: ColorTokens,
): Record<NeedsYouTileId, { Icon: LucideIcon; bg: string; fg: string }> {
  return {
    missed: {
      Icon: CalendarX,
      bg: c.critTint,
      fg: c.crit,
    },
    asked: {
      Icon: MessageCircleQuestionMark,
      bg: c.brandTint,
      fg: c.brand,
    },
    checkins: {
      Icon: ClipboardCheck,
      bg: c.infoTint,
      fg: c.info,
    },
    off: {
      Icon: UtensilsCrossed,
      bg: c.warnTint,
      fg: c.warn,
    },
  };
}

function sectionIcon(
  c: ColorTokens,
): Record<NeedsYouSection["id"], { Icon: LucideIcon; bg: string; fg: string }> {
  const tiles = tileIcon(c);
  return {
    missed: tiles.missed,
    asked: tiles.asked,
    checkins: tiles.checkins,
    off: tiles.off,
    reviewed: {
      Icon: Eye,
      bg: c.fill,
      fg: c.ink2,
    },
  };
}

function chipSpec(
  c: ColorTokens,
): Record<NeedsYouChipKind, { Icon: LucideIcon; bg: string; fg: string }> {
  return {
    critical: {
      Icon: CircleAlert,
      bg: c.critTint,
      fg: c.crit,
    },
    attention: {
      Icon: TriangleAlert,
      bg: c.warnTint,
      fg: c.warn,
    },
    pain: {
      Icon: HeartPulse,
      bg: c.critTint,
      fg: c.crit,
    },
    ask: {
      Icon: MessageCircleQuestionMark,
      bg: c.brandTint,
      fg: c.brandInk,
    },
    checkin: {
      Icon: ClipboardCheck,
      bg: c.infoTint,
      fg: c.info,
    },
    off: {
      Icon: UtensilsCrossed,
      bg: c.warnTint,
      fg: c.warn,
    },
    reviewed: {
      Icon: Eye,
      bg: c.fill,
      fg: c.ink2,
    },
  };
}

export function NeedsYouHeader({
  eyebrow,
  onSearch,
}: {
  eyebrow: string;
  onSearch?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle} accessibilityRole="header">
          Needs you
        </Text>
      </View>
      {onSearch ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search clients"
          onPress={onSearch}
          style={styles.searchBtn}
        >
          <Search color={theme.colors.ink} size={20} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function NeedsYouSummaryGrid({
  tiles,
  loading,
  onJump,
}: {
  tiles: NeedsYouTile[];
  loading?: boolean;
  /** Tap a tile: scroll to that section (D-W14-25). Zero tiles are not pressable. */
  onJump?: (id: NeedsYouTileId) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const icons = tileIcon(theme.colors);
  if (loading) {
    return (
      <View style={styles.grid} accessibilityLabel="Loading summary">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.tile, styles.skelTile]}>
            <View style={[styles.skelBlock, { width: 30, height: 30 }]} />
            <View style={styles.tileBody}>
              <View style={[styles.skelBlock, { width: "60%", height: 14 }]} />
              <View style={[styles.skelBlock, { width: "40%", height: 10 }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => {
        const spec = icons[tile.id];
        const zero = tile.count === 0;
        const content = (
          <>
            <View style={[styles.tileIcon, { backgroundColor: spec.bg }]}>
              <spec.Icon color={spec.fg} size={17} strokeWidth={2.2} />
            </View>
            <View style={styles.tileBody}>
              <View style={styles.tileLine}>
                <Text style={[styles.tileCount, zero ? styles.tileMuted : null]}>
                  {tile.count}
                </Text>
                <Text style={[styles.tileLabel, zero ? styles.tileMuted : null]}>
                  {tile.label}
                </Text>
              </View>
              <Text style={styles.tileSub}>{tile.sub}</Text>
            </View>
            {zero ? null : (
              <ArrowDown color={theme.colors.ink3} size={18} strokeWidth={2.2} />
            )}
          </>
        );
        if (zero || !onJump) {
          return (
            <View
              key={tile.id}
              testID={`needs-you-tile-${tile.id}`}
              style={[styles.tile, zero ? styles.tileZero : null]}
              accessibilityRole="summary"
              accessibilityLabel={`${tile.count} ${tile.label}, ${tile.sub}`}
            >
              {content}
            </View>
          );
        }
        return (
          <Pressable
            key={tile.id}
            testID={`needs-you-tile-${tile.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${tile.label}, ${tile.count}`}
            onPress={() => onJump(tile.id)}
            style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The compact pill row that sticks under the title once the tiles scroll away
 * (TM-01a4). The pill of the section in view is highlighted; a pill with 0 is
 * muted and not pressable.
 */
export function NeedsYouPillRow({
  pills,
  activeId,
  onJump,
  onLayoutHeight,
}: {
  pills: NeedsYouPill[];
  activeId: NeedsYouSectionId | null;
  onJump: (id: NeedsYouSectionId) => void;
  onLayoutHeight?: (height: number) => void;
}) {
  const styles = useStyles();
  return (
    <View
      testID="needs-you-pill-bar"
      style={styles.pillBar}
      onLayout={(e) => onLayoutHeight?.(e.nativeEvent.layout.height)}
    >
      <Text style={styles.pillTitle} accessibilityRole="header">
        Attention
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScroll}
      >
        {pills.map((pill) => {
          const zero = pill.count === 0;
          const active = pill.id === activeId && !zero;
          return (
            <Pressable
              key={pill.id}
              testID={`needs-you-pill-${pill.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${pill.label}, ${pill.count}`}
              accessibilityState={{ selected: active, disabled: zero }}
              disabled={zero}
              onPress={() => onJump(pill.id)}
              style={[
                styles.pill,
                active ? styles.pillActive : null,
                zero ? styles.pillZero : null,
              ]}
            >
              <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>
                {pill.label} {pill.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A section header that collapses and expands its rows (TM-01a5). */
export function NeedsYouSectionHeader({
  section,
  collapsed,
  onToggle,
}: {
  section: NeedsYouSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const spec = sectionIcon(theme.colors)[section.id];
  const Chevron = collapsed ? ChevronDown : ChevronUp;
  return (
    <Pressable
      testID={`needs-you-section-${section.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${section.title}, ${section.count}`}
      accessibilityHint={collapsed ? "Shows the rows" : "Hides the rows"}
      accessibilityState={{ expanded: !collapsed }}
      aria-expanded={!collapsed}
      onPress={onToggle}
      style={styles.sectionHead}
    >
      <View style={[styles.sectionIcon, { backgroundColor: spec.bg }]}>
        <spec.Icon color={spec.fg} size={14} strokeWidth={2.4} />
      </View>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.count}</Text>
      <View style={styles.sectionSpacer} />
      {collapsed ? <Text style={styles.sectionShow}>Show</Text> : null}
      <Chevron color={theme.colors.ink2} size={20} strokeWidth={2.2} />
    </Pressable>
  );
}

/** "See all 5 missed ›": opens the section as its own list. */
export function NeedsYouSeeAllRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID="needs-you-see-all"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.seeAll}
    >
      <Text style={styles.seeAllText}>{label}</Text>
      <ChevronRight color={theme.colors.ink} size={18} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Width of the trailing slot on every row (spec: one fixed slot). */
export const ROW_ACTION_SLOT = 84;

/**
 * Swipe wrapper for rows that can be noted: the same row, inside the shared
 * swipe action. The card's own margin sits outside it so the row looks
 * identical with or without the swipe.
 */
export function NeedsYouRowShell({
  card,
  offline,
  swipeable,
  onMarkReviewed,
  children,
}: {
  card: NeedsYouCardModel;
  offline: boolean;
  swipeable: boolean;
  onMarkReviewed: (card: NeedsYouCardModel) => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  if (!swipeable) return <View style={styles.rowShell}>{children}</View>;
  return (
    <View style={styles.rowShell}>
      <SwipeActionRow
        onMarkReviewed={() => {
          if (!offline) onMarkReviewed(card);
        }}
      >
        {children}
      </SwipeActionRow>
    </View>
  );
}

/**
 * The one row template for every section (D-W14-25): avatar top-aligned, text
 * column at a fixed start, age right-aligned on the name line, chip on its own
 * line, trailing control in a fixed 84 pt slot (button or chevron, centred).
 * Avatar and name open the client's profile (D-W14-27).
 */
export function NeedsYouRow({
  card,
  offline,
  dim,
  onAction,
  onOpenProfile,
}: {
  card: NeedsYouCardModel;
  offline: boolean;
  dim?: boolean;
  onAction: () => void;
  onOpenProfile?: (relationshipId: string) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const tone = avatarTone(card.name, theme.colors);
  const chip = card.chip ? chipSpec(theme.colors)[card.chip.kind] : null;
  const openProfile = onOpenProfile
    ? () => onOpenProfile(card.relationshipId)
    : undefined;
  return (
    <View style={styles.card} testID="needs-you-row">
      <View style={styles.avatarSlot} testID="needs-you-avatar-slot">
        <ClientAvatar
          name={card.name}
          size={44}
          fontSize={14}
          tone={tone}
          onPress={openProfile}
        />
      </View>
      <View style={styles.cardBody} testID="needs-you-text">
        <View style={styles.cardTop}>
          <View style={styles.nameWrap}>
            <ClientNameLink
              name={card.name}
              onPress={openProfile}
              style={styles.name}
            >
              {card.name}
            </ClientNameLink>
          </View>
          <Text style={styles.age}>{card.age}</Text>
        </View>
        <Text style={[styles.issue, dim ? styles.dimText : null]}>{card.issue}</Text>
        {card.chip && chip ? (
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <chip.Icon color={chip.fg} size={13} strokeWidth={2.4} />
            <Text style={[styles.chipText, { color: chip.fg }]}>
              {card.chip.label}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actionSlot} testID="needs-you-slot">
        {card.action ? (
          <Pressable
            testID="needs-you-action"
            accessibilityRole="button"
            accessibilityLabel={`${card.action} ${card.name}`}
            disabled={offline}
            onPress={onAction}
            style={[styles.action, offline ? styles.disabled : null]}
          >
            <Text style={styles.actionText}>{card.action}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID="needs-you-action"
            accessibilityRole="button"
            accessibilityLabel={`Open ${card.name}`}
            disabled={offline}
            onPress={onAction}
            style={[styles.chevronBtn, offline ? styles.disabled : null]}
          >
            <ChevronRight color={theme.colors.ink3} size={18} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** TM-01e skeleton list under the grid. */
export function NeedsYouListSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.sections} accessibilityLabel="Loading">
      <View
        style={[styles.skelBlock, { width: "40%", height: 16, marginBottom: 10 }]}
      />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelCard}>
          <View
            style={[styles.skelBlock, { width: 40, height: 40, borderRadius: 20 }]}
          />
          <View style={styles.tileBody}>
            <View style={[styles.skelBlock, { width: "55%", height: 14 }]} />
            <View style={[styles.skelBlock, { width: "85%", height: 12 }]} />
            <View style={[styles.skelBlock, { width: "30%", height: 18 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: t.colors.ink3,
    fontSize: 15,
    lineHeight: 20,
  },
  screenTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 30,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  searchBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginTop: 18,
    width: 40,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    width: "48%",
    flexGrow: 1,
  },
  tileZero: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  tileIcon: {
    alignItems: "center",
    borderRadius: 10,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  tileBody: { flex: 1, gap: 4, minWidth: 0 },
  tileLine: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tileCount: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  tileLabel: {
    color: t.colors.ink,
    fontFamily: fontFamilyMedium,
    fontSize: 14.5,
  },
  tileSub: {
    color: t.colors.ink3,
    fontSize: 12,
    lineHeight: 16,
  },
  tileMuted: { color: t.colors.ink3 },
  sections: { gap: 18 },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingTop: 10,
  },
  sectionIcon: {
    alignItems: "center",
    borderRadius: 8,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  sectionTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  sectionCount: {
    color: t.colors.ink3,
    fontFamily: fontFamilyMedium,
    fontSize: 15,
  },
  sectionSpacer: { flex: 1 },
  sectionShow: {
    color: t.colors.ink2,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
  },
  rowShell: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  seeAll: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: 8,
    minHeight: 52,
  },
  seeAllText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  card: {
    alignItems: "flex-start",
    backgroundColor: t.colors.card,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatarSlot: { width: 44 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  nameWrap: { flex: 1, minWidth: 0 },
  name: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  age: { color: t.colors.ink3, fontSize: 13, lineHeight: 22 },
  issue: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 1,
  },
  dimText: { color: t.colors.ink3 },
  chip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  actionSlot: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    width: ROW_ACTION_SLOT,
  },
  action: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    width: "100%",
  },
  actionText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  chevronBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  disabled: { opacity: 0.45 },
  pillBar: {
    backgroundColor: t.colors.bg,
    borderBottomColor: t.colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingTop: 8,
  },
  pillTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    marginBottom: 8,
    textAlign: "center",
  },
  pillScroll: { gap: 8, paddingHorizontal: 20 },
  pill: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  pillActive: { backgroundColor: t.colors.ink, borderColor: t.colors.ink },
  pillZero: { opacity: 0.45 },
  pillText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  pillTextActive: { color: t.colors.bg },
  skelTile: { minHeight: 64 },
  skelCard: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
    padding: 14,
  },
  skelBlock: {
    backgroundColor: t.colors.skel1,
    borderRadius: 8,
  },
}));
