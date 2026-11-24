import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type SectionListData,
  type SectionListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { spacing } from "@fitbud/ui-mobile";
import type { PagedFailure } from "../trainer/usePagedList";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { Text } from "./Text";

/** What a parent can drive from outside (restore a position, jump to a day). */
export type ListScreenHandle = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  scrollToLocation: (params: {
    sectionIndex: number;
    itemIndex: number;
    animated?: boolean;
    viewPosition?: number;
  }) => void;
};

type Common = {
  /** Accessible name of the list; the visible title lives in `header`. */
  title: string;
  testID?: string;
  /** Rendered above the rows and scrolling with them (title row, chips). */
  header?: ReactNode;
  /** Shown instead of the rows when the list is empty (skeleton or empty state). */
  empty?: ReactNode;
  /** The paging footer under the last row: see `PagedListFooter`. */
  listFooter?: ReactNode;
  /** Slot under the list: a bar, or a toast above the tab bar. */
  footer?: ReactNode;
  footerVariant?: "bar" | "toast";
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Called once the list is within half a screen of its end (D-W14-26). */
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  /** Rows drawn before the list measures itself (the list's own default if unset). */
  initialNumToRender?: number;
  /** Screens migrated to v3 follow the system theme, as `Screen` does. */
  v3?: boolean;
};

type FlatProps<T> = Common & {
  data: readonly T[];
  sections?: undefined;
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
};

type SectionProps<T, S> = Common & {
  sections: ReadonlyArray<SectionListData<T, S>>;
  data?: undefined;
  renderItem: (info: SectionListRenderItemInfo<T, S>) => ReactElement | null;
  renderSectionHeader?: (info: {
    section: SectionListData<T, S>;
  }) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
  /** Section headers stay at the top while their rows scroll (default true). */
  stickySectionHeaders?: boolean;
};

export type ListScreenProps<T, S = unknown> = FlatProps<T> | SectionProps<T, S>;

/**
 * The v3 list container (Z14-21): the same chrome as `Screen` (safe area,
 * gutters, pull to refresh, footer or toast slot) on a virtualised list that
 * reports its end. `Screen` wraps everything in a ScrollView, which can
 * neither virtualise nor say when the trainer reached the bottom.
 */
function ListScreenBody<T, S>({
  handleRef: ref,
  ...props
}: ListScreenProps<T, S> & { handleRef: Ref<ListScreenHandle> }) {
  const theme = useTheme();
  const styles = useStyles();
  const flat = useRef<FlatList<T>>(null);
  const sectioned = useRef<SectionList<T, S>>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: (params) => {
        const target = flat.current ?? sectioned.current;
        // SectionList forwards to its inner VirtualizedList.
        (target as unknown as FlatList<T> | null)?.scrollToOffset?.(params);
      },
      scrollToLocation: (params) => {
        sectioned.current?.scrollToLocation(params);
      },
    }),
    [],
  );

  const {
    title,
    header,
    empty,
    listFooter,
    footer,
    footerVariant = "bar",
    refreshing,
    onRefresh,
    onEndReached,
    onEndReachedThreshold = 0.5,
    initialNumToRender,
  } = props;

  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing ?? false}
      onRefresh={onRefresh}
      tintColor={theme.colors.ink3}
      colors={[theme.colors.brand]}
      progressBackgroundColor={theme.colors.card}
    />
  ) : undefined;

  const shared = {
    contentContainerStyle: styles.content,
    keyboardShouldPersistTaps: "handled" as const,
    refreshControl,
    onEndReached: onEndReached ? () => onEndReached() : undefined,
    onEndReachedThreshold,
    initialNumToRender,
    ListHeaderComponent: header ? <View>{header}</View> : undefined,
    ListFooterComponent: (
      <View>
        {empty}
        {listFooter}
      </View>
    ),
    showsVerticalScrollIndicator: false,
  };

  return (
    <SafeAreaView style={styles.safe} accessibilityRole="summary">
      <View
        // Same landmark as `Screen`'s body.
        role="main"
        aria-label={title}
        testID={props.testID}
        style={styles.main}
      >
        {props.sections ? (
          <SectionList<T, S>
            ref={sectioned}
            {...shared}
            sections={props.sections}
            renderItem={props.renderItem}
            renderSectionHeader={props.renderSectionHeader}
            keyExtractor={props.keyExtractor}
            stickySectionHeadersEnabled={props.stickySectionHeaders ?? true}
          />
        ) : (
          <FlatList<T>
            ref={flat}
            {...shared}
            data={props.data as readonly T[]}
            renderItem={props.renderItem}
            keyExtractor={props.keyExtractor}
          />
        )}
      </View>
      {footer ? (
        <View
          style={footerVariant === "toast" ? styles.toastFooter : styles.footer}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ListScreenImpl<T, S = unknown>(
  { v3 = false, ...props }: ListScreenProps<T, S>,
  ref: Ref<ListScreenHandle>,
) {
  const body = <ListScreenBody<T, S> {...props} handleRef={ref} />;
  if (!v3) return body;
  return <ThemeScope scheme="system">{body}</ThemeScope>;
}

/** List screen. Light unless `v3` opts the screen in to the system theme. */
export const ListScreen = forwardRef(ListScreenImpl) as <T, S = unknown>(
  props: ListScreenProps<T, S> & { ref?: Ref<ListScreenHandle> },
) => ReactElement;

/**
 * One row of a rounded card list. A virtualised list renders rows one by one,
 * so the card's border and corners belong to its first and last row.
 */
export function CardRow({
  first,
  last,
  style,
  children,
}: {
  first: boolean;
  last: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.cardRow,
        first ? styles.cardRowFirst : null,
        last ? styles.cardRowLast : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type FooterProps = {
  loadingMore: boolean;
  failure: PagedFailure | null;
  onRetry: () => void;
};

/**
 * The paging footer (D-W14-26): a quiet skeleton row while a page loads, an
 * inline retry row when it failed (neutral when offline, D-W14-9), and nothing
 * at the end of the list.
 */
export function PagedListFooter({ loadingMore, failure, onRetry }: FooterProps) {
  const styles = useStyles();
  if (failure) {
    const offline = failure === "offline";
    return (
      <Pressable
        testID="paged-footer-retry"
        accessibilityRole="button"
        accessibilityLabel={
          offline
            ? "You're offline. Showing what's loaded. Tap to try again."
            : "Couldn't load more. Try again"
        }
        onPress={onRetry}
        style={styles.footerRow}
      >
        <Text
          style={[styles.footerText, offline ? null : styles.footerTextFail]}
        >
          {offline
            ? "You're offline. Showing what's loaded."
            : "Couldn't load more. Try again"}
        </Text>
      </Pressable>
    );
  }
  if (loadingMore) {
    return (
      <View
        testID="paged-footer-loading"
        accessibilityLiveRegion="polite"
        accessibilityLabel="Loading more"
        style={styles.footerRow}
      >
        <View style={[styles.skelBlock, styles.skelAvatar]} />
        <View style={styles.skelLines}>
          <View style={[styles.skelBlock, { width: "50%", height: 14 }]} />
          <View style={[styles.skelBlock, { width: "35%", height: 11 }]} />
        </View>
        <Text style={styles.srOnly}>Loading more…</Text>
      </View>
    );
  }
  return null;
}

const useStyles = createThemedStyles((t) => ({
  safe: {
    flex: 1,
    backgroundColor: t.colors.bg,
  },
  main: {
    flex: 1,
  },
  content: {
    // Identical to Screen's content container so the top of the list matches.
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
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
  cardRow: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: "hidden",
  },
  cardRowFirst: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
  },
  cardRowLast: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 1,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    minHeight: 64,
    paddingVertical: 12,
  },
  footerText: { color: t.colors.ink3, fontSize: 14, lineHeight: 20 },
  footerTextFail: { color: t.colors.ink2 },
  skelBlock: { backgroundColor: t.colors.skel1, borderRadius: 8 },
  skelAvatar: { borderRadius: 22, height: 44, width: 44 },
  skelLines: { flex: 1, gap: 7 },
  srOnly: { height: 1, overflow: "hidden", position: "absolute", width: 1 },
}));
