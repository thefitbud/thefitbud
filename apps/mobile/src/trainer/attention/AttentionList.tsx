/**
 * Attention as one SectionList (D-W14-25, Z14-22): the header and the summary
 * tiles are the list header, each section shows its first rows with "See all",
 * headers collapse, and a compact pill row sticks under the title once the
 * tiles scroll away. One scroll container: no inner scrolling panel.
 *
 * It repeats `ListScreen`'s chrome (safe area, pull to refresh, footer slot)
 * because the pill highlight needs `onViewableItemsChanged` and `onScroll`,
 * which `ListScreen` does not pass through and a shared file this task does
 * not own.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { spacing } from "@fitbud/ui-mobile";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import {
  NeedsYouPillRow,
  NeedsYouRow,
  NeedsYouRowShell,
  NeedsYouSectionHeader,
  NeedsYouSeeAllRow,
  NeedsYouSummaryGrid,
} from "./NeedsYouView";
import {
  jumpSectionIndex,
  pillsFor,
  seeAllLabel,
  visibleCards,
  type NeedsYouCardModel,
  type NeedsYouScreenModel,
  type NeedsYouSection,
  type NeedsYouSectionId,
} from "./needsYouModel";

export type AttentionListItem =
  | { kind: "card"; card: NeedsYouCardModel; sectionId: NeedsYouSectionId }
  | { kind: "seeAll"; section: NeedsYouSection };

type ListSection = {
  key: NeedsYouSectionId;
  section: NeedsYouSection;
  data: AttentionListItem[];
};

/** The sections as the list draws them: first rows, then "See all" when there are more. */
export function buildListSections(
  model: NeedsYouScreenModel,
  collapsed: ReadonlySet<NeedsYouSectionId>,
): ListSection[] {
  return model.sections.map((section) => {
    const isCollapsed = collapsed.has(section.id);
    const data: AttentionListItem[] = visibleCards(section, isCollapsed).map(
      (card) => ({ kind: "card", card, sectionId: section.id }),
    );
    if (!isCollapsed && seeAllLabel(section)) {
      data.push({ kind: "seeAll", section });
    }
    return { key: section.id, section, data };
  });
}

type Props = {
  model: NeedsYouScreenModel;
  offline: boolean;
  /** Skeleton tiles while the first load runs. */
  tilesLoading: boolean;
  /** Hide the tiles (load failed, or nothing to summarise). */
  showTiles: boolean;
  /** Banner, title, updating line and error banner: above the tiles. */
  top: ReactNode;
  /** Skeleton, error or all-caught-up state: under the tiles, in place of sections. */
  state: ReactNode;
  collapsed: ReadonlySet<NeedsYouSectionId>;
  onToggleSection: (id: NeedsYouSectionId) => void;
  onSeeAll: (id: NeedsYouSectionId) => void;
  onCardAction: (card: NeedsYouCardModel) => void;
  onMarkReviewed: (card: NeedsYouCardModel) => void;
  onOpenProfile?: (relationshipId: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  footer?: ReactNode;
  footerVariant?: "bar" | "toast";
};

const SWIPE_SECTIONS = new Set<NeedsYouSectionId>(["missed", "off"]);
const DEFAULT_BAR_HEIGHT = 108;

export function AttentionList(props: Props) {
  return (
    <ThemeScope scheme="system">
      <AttentionListBody {...props} />
    </ThemeScope>
  );
}

function AttentionListBody({
  model,
  offline,
  tilesLoading,
  showTiles,
  top,
  state,
  collapsed,
  onToggleSection,
  onSeeAll,
  onCardAction,
  onMarkReviewed,
  onOpenProfile,
  refreshing,
  onRefresh,
  footer,
  footerVariant = "bar",
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const list = useRef<SectionList<AttentionListItem, ListSection>>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  const [barHeight, setBarHeight] = useState(DEFAULT_BAR_HEIGHT);
  const [activeId, setActiveId] = useState<NeedsYouSectionId | null>(null);
  const headerHeight = useRef(0);
  const holdActiveUntil = useRef(0);

  const sections = useMemo(
    () => buildListSections(model, collapsed),
    [model, collapsed],
  );
  const pills = useMemo(() => pillsFor(model), [model]);

  const scrollToSection = useCallback(
    (index: number) => {
      list.current?.scrollToLocation({
        sectionIndex: index,
        itemIndex: 0,
        viewOffset: barHeight,
        viewPosition: 0,
        animated: true,
      });
    },
    [barHeight],
  );

  /** A tile or pill tap: expand the section if needed, then scroll it under the bar. */
  const jump = useCallback(
    (id: NeedsYouSectionId) => {
      const index = jumpSectionIndex(model, id);
      if (index == null) return;
      setActiveId(id);
      holdActiveUntil.current = Date.now() + 1200;
      if (collapsed.has(id)) {
        onToggleSection(id);
        // The rows draw on the next frame; scroll once they have.
        setTimeout(() => scrollToSection(index), 60);
      } else {
        scrollToSection(index);
      }
    },
    [model, collapsed, onToggleSection, scrollToSection],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y >= headerHeight.current;
    setScrolledPast((current) => (current === past ? current : past));
  }, []);

  // Viewability callbacks must keep one identity for the life of the list.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  // A tap on a tile or pill sets the highlight itself and holds it while the
  // scroll settles, so the row of the section above that still peeks out under
  // the bar does not take it back.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (Date.now() < holdActiveUntil.current) return;
      // The section with most rows in view wins; the first of equals.
      const counts = new Map<NeedsYouSectionId, number>();
      for (const token of viewableItems as Array<
        ViewToken & { section?: ListSection }
      >) {
        if (!token.section) continue;
        counts.set(token.section.key, (counts.get(token.section.key) ?? 0) + 1);
      }
      let best: NeedsYouSectionId | null = null;
      let bestCount = 0;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          best = key;
          bestCount = count;
        }
      }
      if (best) setActiveId(best);
    },
  ).current;

  const showBar = showTiles && !tilesLoading && model.sections.length > 0;

  return (
    <SafeAreaView style={styles.safe} accessibilityRole="summary">
      <View role="main" aria-label="Attention" style={styles.main}>
        <SectionList<AttentionListItem, ListSection>
          ref={list}
          testID="attention-list"
          sections={sections}
          keyExtractor={(item) =>
            item.kind === "card" ? item.card.key : `see-all:${item.section.id}`
          }
          stickySectionHeadersEnabled={false}
          initialNumToRender={40}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onScroll}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollToIndexFailed={(info) => {
            // Rows are not measured yet: go near, then try again.
            (
              list.current as unknown as {
                scrollToOffset?: (p: { offset: number; animated: boolean }) => void;
              } | null
            )?.scrollToOffset?.({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(() => {
              list.current?.scrollToLocation({
                sectionIndex: Math.max(0, info.index),
                itemIndex: 0,
                viewOffset: barHeight,
                animated: true,
              });
            }, 80);
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.ink3}
              colors={[theme.colors.brand]}
              progressBackgroundColor={theme.colors.card}
            />
          }
          ListHeaderComponent={
            <View
              testID="attention-list-header"
              onLayout={(e) => {
                headerHeight.current =
                  e.nativeEvent.layout.height + spacing.xxl - barHeight;
              }}
            >
              <View testID="attention-screen">{top}</View>
              {showTiles ? (
                <NeedsYouSummaryGrid
                  tiles={model.tiles}
                  loading={tilesLoading}
                  onJump={jump}
                />
              ) : null}
            </View>
          }
          ListFooterComponent={state ? <View>{state}</View> : null}
          renderSectionHeader={({ section }) => (
            <NeedsYouSectionHeader
              section={section.section}
              collapsed={collapsed.has(section.key)}
              onToggle={() => onToggleSection(section.key)}
            />
          )}
          renderItem={({ item }) => {
            if (item.kind === "seeAll") {
              return (
                <NeedsYouSeeAllRow
                  label={seeAllLabel(item.section) ?? ""}
                  onPress={() => onSeeAll(item.section.id)}
                />
              );
            }
            return (
              <NeedsYouRowShell
                card={item.card}
                offline={offline}
                swipeable={SWIPE_SECTIONS.has(item.sectionId)}
                onMarkReviewed={onMarkReviewed}
              >
                <NeedsYouRow
                  card={item.card}
                  offline={offline}
                  dim={item.sectionId === "reviewed"}
                  onAction={() => onCardAction(item.card)}
                  onOpenProfile={onOpenProfile}
                />
              </NeedsYouRowShell>
            );
          }}
        />
        {showBar ? (
          <View
            pointerEvents={scrolledPast ? "auto" : "none"}
            style={[styles.bar, scrolledPast ? null : styles.barHidden]}
            {...(scrolledPast
              ? {}
              : {
                  "aria-hidden": true,
                  accessibilityElementsHidden: true,
                  importantForAccessibility: "no-hide-descendants" as const,
                })}
          >
            <NeedsYouPillRow
              pills={pills}
              activeId={activeId}
              onJump={jump}
              onLayoutHeight={setBarHeight}
            />
          </View>
        ) : null}
      </View>
      {footer ? (
        <View style={footerVariant === "toast" ? styles.toastFooter : styles.footer}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  main: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  bar: { left: 0, position: "absolute", right: 0, top: 0 },
  barHidden: { opacity: 0 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.line2,
    backgroundColor: t.colors.bg,
  },
  toastFooter: {
    backgroundColor: "transparent",
    paddingBottom: spacing.md,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
}));
