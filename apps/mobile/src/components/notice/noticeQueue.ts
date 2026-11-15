import type { ReactNode } from "react";

/**
 * One queue for in-app banners and toasts (Z12-38, ISSUE-MAP #8).
 *
 * Two lanes share the queue: banners at the top (TR-06h, TM-13b) and toasts at
 * the bottom (TR-07b, TR-26f, TM-04m). Each lane shows **one item at a time**
 * in arrival order and every item leaves on its own:
 *
 * - a banner after `BANNER_MS` (about 4 s), on a swipe up, or on a tap, which
 *   opens its target;
 * - a toast with an action (Undo, View) after `TOAST_ACTION_MS` (6 s) or on a
 *   tap outside it; a toast without one after `TOAST_MS`.
 *
 * A banner and a toast may be up together: they sit at opposite edges, and a
 * toast answers something the person just did (Undo must not wait behind a
 * banner). Decided and noted in the Z12-38 PR.
 *
 * A banner whose target is the screen already open is not shown, and a banner
 * leaves if the person opens its target some other way. A banner `key` is shown
 * at most once per session, so a still-unread item does not come back every
 * time a screen remounts. The store is plain TypeScript (no React, no native
 * modules) so the rules are unit tested with fake timers; `NoticeHost` renders it.
 */

export const BANNER_MS = 4000;
export const TOAST_MS = 4000;
export const TOAST_ACTION_MS = 6000;

/** Why an item left. Only the person's own dismissals and the timer call `onDismiss`. */
export type NoticeDismissReason =
  | "timeout"
  | "swipe"
  | "outside"
  | "close"
  | "open"
  | "action"
  | "removed"
  | "screen";

export type NoticeLeading =
  | { kind: "initials"; name: string; tone: "coach" | "client" }
  | { kind: "meal" }
  | { kind: "app" };

export type BannerInput = {
  /** Shown at most once per session (e.g. `note:<id>`, `meal:<id>`). */
  key?: string;
  /** The screen the tap opens (e.g. `meal:<id>`); not shown while that screen is open. */
  target?: string | null;
  title: string;
  body?: string;
  leading?: NoticeLeading;
  /** Spoken label of the tap target, e.g. "Open Breakfast". */
  openLabel: string;
  onOpen?: () => void;
  onDismiss?: (reason: NoticeDismissReason) => void;
};

export type ToastInput = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  leadingCheck?: boolean;
  leading?: ReactNode;
};

export type BannerItem = BannerInput & { id: string; kind: "banner" };
export type ToastItem = ToastInput & { id: string; kind: "toast" };
export type NoticeItem = BannerItem | ToastItem;

export type NoticeSnapshot = {
  banner: BannerItem | null;
  toast: ToastItem | null;
};

type Lane<T extends NoticeItem> = {
  current: T | null;
  waiting: T[];
  timer: ReturnType<typeof setTimeout> | null;
  /** When the running timer was started and for how long (for hold/resume). */
  startedAt: number;
  remaining: number;
  held: boolean;
};

function emptyLane<T extends NoticeItem>(): Lane<T> {
  return { current: null, waiting: [], timer: null, startedAt: 0, remaining: 0, held: false };
}

export function toastDuration(item: Pick<ToastInput, "actionLabel" | "onAction">): number {
  return item.actionLabel && item.onAction ? TOAST_ACTION_MS : TOAST_MS;
}

export function createNoticeQueue(options: { now?: () => number } = {}) {
  const now = options.now ?? (() => Date.now());
  let nextId = 1;
  let banners = emptyLane<BannerItem>();
  let toasts = emptyLane<ToastItem>();
  let screen: string | null = null;
  const seenKeys = new Set<string>();
  const listeners = new Set<() => void>();
  let snapshot: NoticeSnapshot = { banner: null, toast: null };

  function emit() {
    const next = { banner: banners.current, toast: toasts.current };
    if (next.banner === snapshot.banner && next.toast === snapshot.toast) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function durationOf(item: NoticeItem): number {
    return item.kind === "banner" ? BANNER_MS : toastDuration(item);
  }

  function laneOf(item: NoticeItem): Lane<NoticeItem> {
    return (item.kind === "banner" ? banners : toasts) as Lane<NoticeItem>;
  }

  function clearTimer(lane: Lane<NoticeItem>) {
    if (lane.timer) clearTimeout(lane.timer);
    lane.timer = null;
  }

  function startTimer(lane: Lane<NoticeItem>, ms: number) {
    clearTimer(lane);
    const item = lane.current;
    if (!item) return;
    lane.startedAt = now();
    lane.remaining = ms;
    lane.held = false;
    lane.timer = setTimeout(() => {
      lane.timer = null;
      if (lane.current?.id === item.id) dismiss(item.id, "timeout");
    }, ms);
  }

  function suppressed(item: NoticeItem): boolean {
    return item.kind === "banner" && item.target != null && item.target === screen;
  }

  /** Move the next showable item up, skipping banners for the screen already open. */
  function advance(lane: Lane<NoticeItem>) {
    clearTimer(lane);
    lane.current = null;
    while (lane.waiting.length > 0) {
      const next = lane.waiting.shift()!;
      if (suppressed(next)) continue;
      lane.current = next;
      startTimer(lane, durationOf(next));
      return;
    }
  }

  function enqueue(item: NoticeItem): string {
    const lane = laneOf(item);
    if (lane.current) {
      lane.waiting.push(item);
    } else {
      lane.current = item;
      startTimer(lane, durationOf(item));
    }
    emit();
    return item.id;
  }

  /** Queue a banner. Null when its key was already shown, or its target is open. */
  function showBanner(input: BannerInput): string | null {
    if (input.key) {
      if (seenKeys.has(input.key)) return null;
    }
    const item: BannerItem = { ...input, id: `n${nextId++}`, kind: "banner" };
    if (suppressed(item)) return null;
    if (input.key) seenKeys.add(input.key);
    return enqueue(item);
  }

  function showToast(input: ToastInput): string {
    return enqueue({ ...input, id: `n${nextId++}`, kind: "toast" });
  }

  function find(id: string): { lane: Lane<NoticeItem>; item: NoticeItem; current: boolean } | null {
    for (const lane of [banners, toasts] as Lane<NoticeItem>[]) {
      if (lane.current?.id === id) return { lane, item: lane.current, current: true };
      const waiting = lane.waiting.find((item) => item.id === id);
      if (waiting) return { lane, item: waiting, current: false };
    }
    return null;
  }

  function callDismiss(item: NoticeItem, reason: NoticeDismissReason) {
    if (!["timeout", "swipe", "outside", "close"].includes(reason)) return;
    if (item.kind === "banner") item.onDismiss?.(reason);
    else item.onDismiss?.();
  }

  /** Take an item off the queue (current or waiting). Safe to call twice. */
  function dismiss(id: string, reason: NoticeDismissReason): void {
    const found = find(id);
    if (!found) return;
    if (found.current) advance(found.lane);
    else found.lane.waiting = found.lane.waiting.filter((item) => item.id !== id);
    emit();
    callDismiss(found.item, reason);
  }

  /** A tap on a banner: it leaves, then its target opens. */
  function open(id: string): void {
    const found = find(id);
    if (!found || found.item.kind !== "banner") return;
    const item = found.item;
    dismiss(id, "open");
    item.onOpen?.();
  }

  /** A tap on a toast's action: the toast leaves, then the action runs. */
  function act(id: string): void {
    const found = find(id);
    if (!found || found.item.kind !== "toast") return;
    const item = found.item;
    dismiss(id, "action");
    item.onAction?.();
  }

  /** Pause the visible item's timer (a finger is on it). */
  function hold(id: string): void {
    const found = find(id);
    if (!found?.current || found.lane.held) return;
    const elapsed = now() - found.lane.startedAt;
    clearTimer(found.lane);
    found.lane.remaining = Math.max(0, found.lane.remaining - elapsed);
    found.lane.held = true;
  }

  /** Restart the timer with what was left (at least one second). */
  function resume(id: string): void {
    const found = find(id);
    if (!found?.current || !found.lane.held) return;
    startTimer(found.lane, Math.max(1000, found.lane.remaining));
  }

  /** The screen now open (`null` when unknown). A banner for it leaves. */
  function setScreen(next: string | null): void {
    screen = next;
    if (banners.current && suppressed(banners.current)) {
      dismiss(banners.current.id, "screen");
    }
    banners.waiting = banners.waiting.filter((item) => !suppressed(item));
  }

  /*
   * Tap outside a toast with an action (TR-07b's Undo, View): the toast marks
   * its own touches (`markToastTouch`, bubbling reaches it first), the host's
   * root reports every touch start and end. Only a tap that began while that
   * same toast was up counts, so the tap that created the toast never closes it.
   */
  let toastTouched = false;
  let pendingTouch: { toastId: string | null; inside: boolean } | null = null;

  function markToastTouch(): void {
    toastTouched = true;
  }

  function touchStart(): void {
    pendingTouch = { toastId: toasts.current?.id ?? null, inside: toastTouched };
    toastTouched = false;
  }

  /** `moved`: the finger travelled (a scroll or a swipe), so it was not a tap. */
  function touchEnd(moved: boolean): void {
    const touch = pendingTouch;
    pendingTouch = null;
    if (!touch?.toastId || touch.inside || moved) return;
    const current = toasts.current;
    if (!current || current.id !== touch.toastId) return;
    if (toastDuration(current) !== TOAST_ACTION_MS) return;
    dismiss(current.id, "outside");
  }

  /** Sign-out or a user switch: drop everything, forget what was shown. */
  function reset(): void {
    clearTimer(banners as Lane<NoticeItem>);
    clearTimer(toasts as Lane<NoticeItem>);
    banners = emptyLane();
    toasts = emptyLane();
    seenKeys.clear();
    pendingTouch = null;
    toastTouched = false;
    emit();
  }

  return {
    showBanner,
    showToast,
    dismiss,
    open,
    act,
    hold,
    resume,
    setScreen,
    markToastTouch,
    touchStart,
    touchEnd,
    reset,
    getScreen: () => screen,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type NoticeQueue = ReturnType<typeof createNoticeQueue>;

/** The app's one queue, rendered by the `NoticeHost` mounted in `AppRouter`. */
export const noticeQueue = createNoticeQueue();
