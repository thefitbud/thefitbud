import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "./Text";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
  withAlpha,
} from "../providers/ThemeProvider";
import { useNoticeQueue } from "./notice/NoticeContext";
import type { NoticeQueue } from "./notice/noticeQueue";

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Leading check icon (frame 05 Mark reviewed toast). */
  leadingCheck?: boolean;
  leading?: ReactNode;
};

/**
 * Toast (kit `.toast`): navy fill with white text and a white-tint action in
 * both themes (`--navy` is #33333C in dark).
 *
 * Inside the app's `NoticeHost` (Z12-38) a rendered Snackbar is a request to
 * the shared queue: it draws where its screen puts it, but only while it is
 * the queue's current toast, and it leaves on its own (6 s with an action, 4 s
 * without, or a tap outside an action toast), calling `onDismiss`. Its call
 * signature is unchanged, so callers need no change. Outside a host (render
 * tests, the primitive gallery) it draws in place as before.
 */
export function Snackbar(props: Props) {
  const queue = useNoticeQueue();
  return queue ? <QueuedSnackbar {...props} queue={queue} /> : <SnackbarView {...props} />;
}

function QueuedSnackbar({ queue, ...props }: Props & { queue: NoticeQueue }) {
  const latest = useRef(props);
  latest.current = props;
  const [id, setId] = useState<string | null>(null);
  const hasAction = Boolean(props.actionLabel && props.onAction);

  // A new message (or a new action) is a new toast; the old one leaves quietly.
  useEffect(() => {
    const next = queue.showToast({
      message: props.message,
      actionLabel: hasAction ? props.actionLabel : undefined,
      onAction: hasAction ? () => latest.current.onAction?.() : undefined,
      onDismiss: () => latest.current.onDismiss?.(),
    });
    setId(next);
    return () => queue.dismiss(next, "removed");
  }, [queue, props.message, props.actionLabel, hasAction]);

  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const visible = id != null && snapshot.toast?.id === id;

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility?.(props.message);
    // Announce once each time this toast comes up.
  }, [visible]);

  if (!visible || id == null) return null;
  return (
    <SnackbarView
      {...props}
      onAction={hasAction ? () => queue.act(id) : undefined}
      onDismiss={props.onDismiss ? () => queue.dismiss(id, "close") : undefined}
      onTouchInside={() => queue.markToastTouch()}
    />
  );
}

function SnackbarView({
  message,
  actionLabel,
  onAction,
  onDismiss,
  leadingCheck = false,
  leading,
  onTouchInside,
}: Props & { onTouchInside?: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const leadingNode = leadingCheck ? (
    <Check color={theme.colors.toastOk} size={18} strokeWidth={2.4} />
  ) : (
    leading
  );

  return (
    <View
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      testID="notice-toast"
      onTouchStart={onTouchInside}
    >
      {leadingNode ? <View style={styles.leading}>{leadingNode}</View> : null}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.actionHit}
        >
          <View style={styles.actionPill}>
            <Text style={styles.action}>{actionLabel}</Text>
          </View>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={styles.dismissHit}
        >
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: {
    alignItems: "center",
    backgroundColor: t.colors.navy,
    borderRadius: t.radii.toast,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.28,
    shadowRadius: 13,
    elevation: t.scheme === "dark" ? 0 : 6,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.edge,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: t.colors.white,
    flex: 1,
    fontSize: 14.5,
    fontWeight: "500",
    lineHeight: 20,
  },
  actionHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
  },
  actionPill: {
    backgroundColor: withAlpha(t.colors.white, 0.14),
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  action: {
    color: t.colors.white,
    fontSize: 14.5,
    fontWeight: "600",
  },
  dismissHit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
    minWidth: t.touchTarget,
  },
  dismiss: {
    color: t.colors.white,
    fontSize: 16,
  },
}));
