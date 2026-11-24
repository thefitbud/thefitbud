import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { createThemedStyles } from "../providers/ThemeProvider";

/**
 * Z14-18: a pushed screen laid over the screen below it.
 *
 * It fills its parent with an opaque layer, so whatever is rendered beneath
 * (the tab tree, or another pushed screen) stays mounted and keeps its state
 * and scroll position, and is really visible while the layer is dragged away.
 *
 * - Slides in from the right in 250 ms (native driver off web).
 * - iOS: a pan that starts within 24 pt of the left edge drags it; releasing
 *   past 35 % of the width, or with velocity above 500 pt/s, completes
 *   `onBack`; otherwise it springs back. The pan activates only from the edge
 *   and fails on vertical movement, so scrolling and swipe rows inside keep
 *   working.
 * - Android has no edge pan here: its system back gesture is handled by
 *   `useHardwareBack`.
 * - VoiceOver two-finger scrub calls `onBack` (`onAccessibilityEscape`).
 */
/** Props for a layer that sits under a pushed screen: hidden from screen readers. */
export const HIDDEN_FROM_READERS = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

export const EDGE_WIDTH = 24;
export const COMPLETE_FRACTION = 0.35;
export const COMPLETE_VELOCITY = 500;
export const SLIDE_MS = 250;

export function edgeSwipeOutcome(
  translationX: number,
  velocityX: number,
  width: number,
): "complete" | "cancel" {
  if (translationX > width * COMPLETE_FRACTION || velocityX > COMPLETE_VELOCITY) {
    return "complete";
  }
  return "cancel";
}

/** iOS: the screen is modal to VoiceOver, and the two-finger scrub goes back. */
export function voiceOverProps(onBack: () => void) {
  return { accessibilityViewIsModal: true, onAccessibilityEscape: onBack } as const;
}

const useNative = Platform.OS !== "web";

/** The edge pan, built apart from the view so its rules can be tested. */
export function createEdgeSwipeGesture(opts: {
  width: number;
  x: Animated.Value;
  onComplete: () => void;
}) {
  const { width, x, onComplete } = opts;
  return Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(10)
    .failOffsetY([-12, 12])
    .onUpdate((event: { translationX: number }) => {
      x.setValue(Math.max(0, event.translationX));
    })
    .onEnd((event: { translationX: number; velocityX: number }) => {
      if (edgeSwipeOutcome(event.translationX, event.velocityX, width) === "complete") {
        Animated.timing(x, {
          toValue: width,
          duration: 150,
          useNativeDriver: useNative,
        }).start(() => onComplete());
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: useNative }).start();
      }
    });
}

export type PushedScreenProps = {
  onBack: () => void;
  children: ReactNode;
  /** Slide in on mount. Off for screenshots and tests that need a settled frame. */
  animateIn?: boolean;
  testID?: string;
};

export function PushedScreen({
  onBack,
  children,
  animateIn = true,
  testID,
}: PushedScreenProps) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(animateIn ? width : 0)).current;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!animateIn) return;
    Animated.timing(x, {
      toValue: 0,
      duration: SLIDE_MS,
      useNativeDriver: useNative,
    }).start();
  }, [animateIn, x]);

  const gesture = useMemo(
    () => createEdgeSwipeGesture({ width, x, onComplete: () => onBackRef.current() }),
    [width, x],
  );

  const body = (
    <Animated.View
      testID={testID ?? "pushed-screen"}
      style={[styles.layer, { transform: [{ translateX: x }] }]}
      {...voiceOverProps(() => onBackRef.current())}
    >
      {children}
    </Animated.View>
  );

  if (Platform.OS !== "ios") return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}

const useStyles = createThemedStyles((t) => ({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.bg,
    shadowColor: t.colors.ink,
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
}));
