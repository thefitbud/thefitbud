/**
 * Needs you v3 chrome (TM-01*): summary grid, section headers, and cards.
 * Follows system light/dark via ThemeScope on `<Screen v3>` (D-W12-12).
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  CalendarX,
  ChevronRight,
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
import { initialsFromName } from "../../components/m2";
import { SwipeActionRow } from "../../components/SwipeActionRow";
import {
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import type {
  NeedsYouCardModel,
  NeedsYouChipKind,
  NeedsYouScreenModel,
  NeedsYouSection,
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

type Props = {
  model: NeedsYouScreenModel;
  offline: boolean;
  loading: boolean;
  emptySlot?: ReactNode;
  onSearch?: () => void;
  onCardAction: (card: NeedsYouCardModel) => void;
  onMarkReviewed: (card: NeedsYouCardModel) => void;
};

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
}: {
  tiles: NeedsYouTile[];
  loading?: boolean;
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
        return (
          <View
            key={tile.id}
            style={[styles.tile, zero ? styles.tileZero : null]}
            accessibilityRole="summary"
            accessibilityLabel={`${tile.count} ${tile.label}, ${tile.sub}`}
          >
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
          </View>
        );
      })}
    </View>
  );
}

export function NeedsYouSections({
  model,
  offline,
  emptySlot,
  onCardAction,
  onMarkReviewed,
}: Omit<Props, "loading" | "onSearch">) {
  const styles = useStyles();
  if (model.allCaughtUp) {
    return <>{emptySlot}</>;
  }
  return (
    <View style={styles.sections}>
      {model.sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          offline={offline}
          onCardAction={onCardAction}
          onMarkReviewed={onMarkReviewed}
        />
      ))}
    </View>
  );
}

function Section({
  section,
  offline,
  onCardAction,
  onMarkReviewed,
}: {
  section: NeedsYouSection;
  offline: boolean;
  onCardAction: (card: NeedsYouCardModel) => void;
  onMarkReviewed: (card: NeedsYouCardModel) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const spec = sectionIcon(theme.colors)[section.id];
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead} accessibilityRole="header">
        <View style={[styles.sectionIcon, { backgroundColor: spec.bg }]}>
          <spec.Icon color={spec.fg} size={14} strokeWidth={2.4} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.count}</Text>
        {section.hint ? (
          <Text style={styles.sectionHint}>{section.hint}</Text>
        ) : null}
      </View>
      <View style={styles.listCard}>
        {section.cards.map((card, index) => {
          const body = (
            <>
              {index > 0 ? <View style={styles.divider} /> : null}
              <NeedsYouCard
                card={card}
                offline={offline}
                dim={section.id === "reviewed"}
                onAction={() => onCardAction(card)}
              />
            </>
          );
          if (section.id === "missed" || section.id === "off") {
            return (
              <SwipeActionRow
                key={card.key}
                onMarkReviewed={() => {
                  if (!offline) onMarkReviewed(card);
                }}
              >
                {body}
              </SwipeActionRow>
            );
          }
          return <View key={card.key}>{body}</View>;
        })}
      </View>
    </View>
  );
}

function NeedsYouCard({
  card,
  offline,
  dim,
  onAction,
}: {
  card: NeedsYouCardModel;
  offline: boolean;
  dim?: boolean;
  onAction: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const tone = avatarTone(card.name, theme.colors);
  const chip = card.chip ? chipSpec(theme.colors)[card.chip.kind] : null;
  return (
    <View
      style={[styles.card, offline || dim ? styles.disabled : null]}
    >
      <View style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.avatarText, { color: tone.color }]}>
          {initialsFromName(card.name)}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.name}>{card.name}</Text>
          <Text style={styles.age}>{card.age}</Text>
        </View>
        <Text style={styles.issue}>{card.issue}</Text>
        {card.chip && chip ? (
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <chip.Icon color={chip.fg} size={13} strokeWidth={2.4} />
            <Text style={[styles.chipText, { color: chip.fg }]}>
              {card.chip.label}
            </Text>
          </View>
        ) : null}
      </View>
      {card.action ? (
        <Pressable
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
          accessibilityRole="button"
          accessibilityLabel={`Open ${card.name}`}
          disabled={offline}
          onPress={onAction}
          hitSlop={8}
        >
          <ChevronRight color={theme.colors.ink3} size={18} />
        </Pressable>
      )}
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
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: "48%",
    flexGrow: 1,
  },
  tileZero: { opacity: 0.55 },
  tileIcon: {
    alignItems: "center",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
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
  section: { gap: 8 },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 28,
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
  sectionHint: {
    color: t.colors.ink3,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "right",
  },
  listCard: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    backgroundColor: t.colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  card: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 13 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  name: {
    color: t.colors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  age: { color: t.colors.ink3, fontSize: 13 },
  issue: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 1,
  },
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
  action: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  actionText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  disabled: { opacity: 0.45 },
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
