import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { ThemeScope, useBarScheme } from "../../providers/ThemeProvider";
import { NoticeContext } from "./NoticeContext";
import { NoticeBannerView } from "./NoticeBannerView";
import { noticeQueue, type BannerItem, type NoticeQueue } from "./noticeQueue";
import { useReducedMotion } from "./useReducedMotion";

/** A swipe up this far (pt), or this fast (pt/ms), dismisses the banner. */
export const SWIPE_DISMISS_DISTANCE = 24;
export const SWIPE_DISMISS_VELOCITY = 0.5;

/** Whether a released drag dismisses the banner (only upward drags count). */
export function swipeDismisses(dy: number, vy: number): boolean {
  if (dy >= 0) return false;
  return dy <= -SWIPE_DISMISS_DISTANCE || vy <= -SWIPE_DISMISS_VELOCITY;
}

/** What a screen reader hears when a banner appears. */
export function bannerAnnouncement(item: Pick<BannerItem, "title" | "body">): string {
  return [item.title, item.body].filter(Boolean).join(". ");
}

/** Below this travel (pt) a touch is a tap, not a scroll. */
const TAP_SLOP = 10;
const NATIVE_DRIVER = Platform.OS !== "web";

function touchPoint(event: GestureResponderEvent): { x: number; y: number } | null {
  const native = event.nativeEvent as unknown as {
    pageX?: number;
    pageY?: number;
    changedTouches?: ArrayLike<{ pageX: number; pageY: number }>;
  };
  const touch = native.changedTouches?.[0] ?? native;
  if (typeof touch.pageX !== "number" || typeof touch.pageY !== "number") return null;
  return { x: touch.pageX, y: touch.pageY };
}

/** Clear of the status bar: iOS through SafeAreaView, Android by the bar's height. */
const TOP_GAP =
  Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 6 : Platform.OS === "web" ? 12 : 0;

function BannerLayer({ queue, banner }: { queue: NoticeQueue; banner: BannerItem | null }) {
  const reducedMotion = useReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const [shown, setShown] = useState<BannerItem | null>(banner);
  const latest = useRef(banner);
  latest.current = banner;
  const enter = useRef(new Animated.Value(banner ? 1 : 0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const shownId = useRef<string | null>(shown?.id ?? null);
  shownId.current = shown?.id ?? null;

  // The queue moved on: slide the old banner out (unless motion is reduced), then swap.
  useEffect(() => {
    if (banner?.id === shown?.id) return;
    if (!shown || reducedMotion) {
      setShown(banner);
      return;
    }
    Animated.timing(enter, { toValue: 0, duration: 160, useNativeDriver: NATIVE_DRIVER }).start(
      () => setShown(latest.current),
    );
  }, [banner, shown, reducedMotion, enter]);

  // A new banner: slide in (or appear) and announce it.
  const shownKey = shown?.id ?? null;
  useEffect(() => {
    if (!shownKey || !shown) return;
    drag.setValue(0);
    if (reducedRef.current) {
      enter.setValue(1);
    } else {
      enter.setValue(0);
      Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: NATIVE_DRIVER }).start();
    }
    AccessibilityInfo.announceForAccessibility?.(bannerAnnouncement(shown));
    // Only on a new banner id.
  }, [shownKey]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          if (shownId.current) queue.hold(shownId.current);
        },
        onPanResponderMove: (_e, g) => drag.setValue(Math.min(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          const id = shownId.current;
          if (!id) return;
          if (swipeDismisses(g.dy, g.vy)) {
            if (reducedRef.current) {
              queue.dismiss(id, "swipe");
              return;
            }
            Animated.timing(drag, {
              toValue: -240,
              duration: 160,
              useNativeDriver: NATIVE_DRIVER,
            }).start(() => queue.dismiss(id, "swipe"));
            return;
          }
          if (reducedRef.current) drag.setValue(0);
          else Animated.spring(drag, { toValue: 0, useNativeDriver: NATIVE_DRIVER }).start();
          queue.resume(id);
        },
        onPanResponderTerminate: () => {
          drag.setValue(0);
          if (shownId.current) queue.resume(shownId.current);
        },
      }),
    [queue, drag],
  );

  if (!shown) return null;
  const id = shown.id;
  const translateY = Animated.add(
    drag,
    enter.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }),
  );
  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <SafeAreaView pointerEvents="box-none">
        <View pointerEvents="box-none" style={styles.inset}>
          <Animated.View
            {...pan.panHandlers}
            style={{ opacity: enter, transform: [{ translateY }] }}
          >
            <Pressable
              testID="notice-banner"
              accessibilityRole="button"
              accessibilityLabel={bannerAnnouncement(shown)}
              accessibilityHint={shown.openLabel}
              accessibilityActions={[{ name: "escape", label: "Dismiss" }]}
              onAccessibilityEscape={() => queue.dismiss(id, "close")}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "escape") queue.dismiss(id, "close");
              }}
              onPress={() => queue.open(id)}
            >
              <NoticeBannerView title={shown.title} body={shown.body} leading={shown.leading} />
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Mounted once, in `AppRouter`, around both roles' screens (Z12-38). Draws the
 * banner lane at the top, clear of the status bar; toasts draw where their
 * screen puts them (`Snackbar`), gated by the same queue. The root view only
 * listens to touches (it never takes the responder) to close a toast with an
 * action on a tap outside it.
 */
export function NoticeHost({
  children,
  queue = noticeQueue,
}: {
  children: ReactNode;
  queue?: NoticeQueue;
}) {
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const scheme = useBarScheme();
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <NoticeContext.Provider value={queue}>
      <View
        style={styles.root}
        onTouchStart={(event) => {
          start.current = touchPoint(event);
          queue.touchStart();
        }}
        onTouchEnd={(event) => {
          const from = start.current;
          const to = touchPoint(event);
          start.current = null;
          const moved =
            from != null &&
            to != null &&
            Math.hypot(to.x - from.x, to.y - from.y) > TAP_SLOP;
          queue.touchEnd(moved);
        }}
      >
        {children}
        {/* The banner follows the open screen's theme (light until it opts in to dark). */}
        <ThemeScope scheme={scheme} drivesSystemBars={false}>
          <BannerLayer queue={queue} banner={snapshot.banner} />
        </ThemeScope>
      </View>
    </NoticeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  inset: {
    paddingHorizontal: 10,
    paddingTop: TOP_GAP,
  },
});
