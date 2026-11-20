/**
 * iOS will not present a modal while another is still animating out. Queue the
 * next open until the closing Modal's `onDismiss` fires; elsewhere run at once.
 * A short fallback covers platforms and tests where `onDismiss` never fires.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Fallback if Modal `onDismiss` never fires (tests, rare RN cases). The slide
 * animation is shorter than this; MoreSheet uses the same window.
 */
export const MODAL_CLOSE_FALLBACK_MS = 600;

export type ModalCloseGate = {
  /** Run `open` once the closing modal has gone (iOS), or at once elsewhere. */
  afterClose: (open: () => void) => void;
  /** Call from Modal `onDismiss` / sheet `onClosed`. */
  notifyClosed: () => void;
  /** Drop a queued open without running it (unmount). */
  cancel: () => void;
};

export function createModalCloseGate(): ModalCloseGate {
  let pending: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  };

  return {
    afterClose(open) {
      if (Platform.OS !== "ios") {
        open();
        return;
      }
      pending = open;
      clearTimer();
      timer = setTimeout(() => {
        if (pending !== open) return;
        pending = null;
        timer = null;
        open();
      }, MODAL_CLOSE_FALLBACK_MS);
    },
    notifyClosed() {
      clearTimer();
      const next = pending;
      pending = null;
      next?.();
    },
    cancel() {
      clearTimer();
      pending = null;
    },
  };
}

/** One gate per screen that sequences its sheets. */
export function useModalCloseGate(): ModalCloseGate {
  const gate = useRef(createModalCloseGate()).current;
  useEffect(() => () => gate.cancel(), [gate]);
  return gate;
}
