import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BANNER_MS,
  NOTICE_TICK_MS,
  TOAST_ACTION_MS,
  TOAST_MS,
  createNoticeQueue,
  type BannerInput,
} from "./noticeQueue";

const note: BannerInput = {
  key: "note:00000000-0000-4000-8000-0000000c0002",
  title: "Rahul has a note for you",
  body: "Try 42.5 kg on the RDLs today if set 2 feels easy.",
  leading: { kind: "initials", name: "Rahul Verma", tone: "coach" },
  openLabel: "Open",
};
const meal: BannerInput = {
  key: "meal:00000000-0000-4000-8000-000000000301",
  target: "meal:00000000-0000-4000-8000-000000000301",
  title: "Evening snack isn't logged yet",
  body: "Roasted chana · tap to log",
  leading: { kind: "meal" },
  openLabel: "Open Evening snack",
};

describe("notice queue (Z12-38)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows banners one at a time in arrival order, each for about 4 s", () => {
    const queue = createNoticeQueue();
    const onDismiss = vi.fn();
    queue.showBanner({ ...meal, onDismiss });
    queue.showBanner(note);
    expect(queue.getSnapshot().banner?.title).toBe("Evening snack isn't logged yet");

    vi.advanceTimersByTime(BANNER_MS - 1);
    expect(queue.getSnapshot().banner?.title).toBe("Evening snack isn't logged yet");
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledWith("timeout");
    expect(queue.getSnapshot().banner?.title).toBe("Rahul has a note for you");

    vi.advanceTimersByTime(BANNER_MS);
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("a toast with an action stays 6 s, one without 4 s, and toasts do not wait behind a banner", () => {
    const queue = createNoticeQueue();
    const onDismiss = vi.fn();
    queue.showBanner(note);
    queue.showToast({
      message: "Evening snack logged as planned",
      actionLabel: "Undo",
      onAction: vi.fn(),
      onDismiss,
    });
    queue.showToast({ message: "Link copied" });
    expect(queue.getSnapshot().banner?.title).toBe("Rahul has a note for you");
    expect(queue.getSnapshot().toast?.message).toBe("Evening snack logged as planned");

    vi.advanceTimersByTime(TOAST_ACTION_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().toast?.message).toBe("Link copied");
    vi.advanceTimersByTime(TOAST_MS);
    expect(queue.getSnapshot().toast).toBeNull();
  });

  it("a tap opens the banner's target and lets the next one up, without calling onDismiss", () => {
    const queue = createNoticeQueue();
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    const id = queue.showBanner({ ...note, onOpen, onDismiss })!;
    queue.showBanner(meal);
    queue.open(id);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(queue.getSnapshot().banner?.title).toBe("Evening snack isn't logged yet");
  });

  it("a swipe dismisses with its reason; dismissing twice is harmless", () => {
    const queue = createNoticeQueue();
    const onDismiss = vi.fn();
    const id = queue.showBanner({ ...note, onDismiss })!;
    queue.dismiss(id, "swipe");
    queue.dismiss(id, "swipe");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith("swipe");
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("no banner for the screen already open, and an open banner leaves when its screen opens", () => {
    const queue = createNoticeQueue();
    queue.setScreen(meal.target!);
    expect(queue.showBanner(meal)).toBeNull();
    expect(queue.getSnapshot().banner).toBeNull();

    // Not "seen": once the person leaves the meal, the banner may still come.
    queue.setScreen("tab:today");
    expect(queue.showBanner(meal)).not.toBeNull();
    queue.showBanner(note);
    queue.setScreen(meal.target!);
    expect(queue.getSnapshot().banner?.title).toBe("Rahul has a note for you");
  });

  it("a tab never suppresses a banner (TR-06h is over Today)", () => {
    const queue = createNoticeQueue();
    queue.setScreen("tab:today");
    expect(queue.showBanner(note)).not.toBeNull();
  });

  it("never arms a JS timer longer than 1 s (iOS parks longer ones on a run-loop NSTimer), yet leaves at 4 s", () => {
    // RCTTiming.mm (RN 0.76) moves any timer due more than kMinimumSleepInterval
    // (1 s) away off its display link onto a shared default-mode NSTimer; that is
    // the path TR-06h's 4 s dismissal outlived on the iOS simulator.
    const armed = vi.spyOn(globalThis, "setTimeout");
    const queue = createNoticeQueue();
    queue.showBanner(note);
    queue.showToast({ message: "Lunch skipped", actionLabel: "Undo", onAction: vi.fn() });
    vi.advanceTimersByTime(BANNER_MS - 1);
    expect(queue.getSnapshot().banner).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot().banner).toBeNull();
    vi.advanceTimersByTime(TOAST_ACTION_MS);
    expect(queue.getSnapshot().toast).toBeNull();
    const delays = armed.mock.calls.map((call) => Number(call[1] ?? 0));
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(1000);
    armed.mockRestore();
  });

  it("leaves at its wall-clock deadline: a tick that fires early waits, one that fires late leaves at once", () => {
    let clock = 1_000_000;
    const queue = createNoticeQueue({ now: () => clock });
    const onDismiss = vi.fn();
    queue.showBanner({ ...note, onDismiss });

    // The JS timers run, but the clock has not reached the deadline: still up.
    vi.advanceTimersByTime(BANNER_MS * 3);
    expect(queue.getSnapshot().banner).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();

    // Timers held back past the deadline: the first tick that runs removes it.
    clock += BANNER_MS + 5000;
    vi.advanceTimersByTime(NOTICE_TICK_MS);
    expect(queue.getSnapshot().banner).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith("timeout");
  });

  it("a key shows once per session, until reset", () => {
    const queue = createNoticeQueue();
    const id = queue.showBanner(note)!;
    queue.dismiss(id, "timeout");
    expect(queue.showBanner(note)).toBeNull();
    queue.reset();
    expect(queue.showBanner(note)).not.toBeNull();
  });

  it("a finger on the banner pauses its timer; release gives back what was left", () => {
    const queue = createNoticeQueue();
    const id = queue.showBanner(note)!;
    vi.advanceTimersByTime(3000);
    queue.hold(id);
    vi.advanceTimersByTime(10_000);
    expect(queue.getSnapshot().banner?.id).toBe(id);
    queue.resume(id);
    vi.advanceTimersByTime(999);
    expect(queue.getSnapshot().banner?.id).toBe(id);
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("the action runs once and the toast leaves", () => {
    const queue = createNoticeQueue();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const id = queue.showToast({ message: "Lunch skipped", actionLabel: "Undo", onAction, onDismiss });
    queue.act(id);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(queue.getSnapshot().toast).toBeNull();
  });

  describe("tap outside a toast with an action", () => {
    it("closes it", () => {
      const queue = createNoticeQueue();
      const onDismiss = vi.fn();
      queue.showToast({ message: "Lunch skipped", actionLabel: "Undo", onAction: vi.fn(), onDismiss });
      queue.touchStart();
      queue.touchEnd(false);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(queue.getSnapshot().toast).toBeNull();
    });

    it("not a tap on the toast itself, not a scroll, not the tap that created it", () => {
      const queue = createNoticeQueue();
      // The tap that creates the toast began before it existed.
      queue.touchStart();
      queue.showToast({ message: "Lunch skipped", actionLabel: "Undo", onAction: vi.fn() });
      queue.touchEnd(false);
      expect(queue.getSnapshot().toast).not.toBeNull();

      queue.markToastTouch();
      queue.touchStart();
      queue.touchEnd(false);
      expect(queue.getSnapshot().toast).not.toBeNull();

      queue.touchStart();
      queue.touchEnd(true);
      expect(queue.getSnapshot().toast).not.toBeNull();
    });

    it("a toast without an action ignores it and leaves on its timer", () => {
      const queue = createNoticeQueue();
      queue.showToast({ message: "Link copied" });
      queue.touchStart();
      queue.touchEnd(false);
      expect(queue.getSnapshot().toast?.message).toBe("Link copied");
    });
  });

  it("removing a waiting item keeps the current one", () => {
    const queue = createNoticeQueue();
    queue.showToast({ message: "First" });
    const second = queue.showToast({ message: "Second" });
    queue.showToast({ message: "Third" });
    queue.dismiss(second, "removed");
    vi.advanceTimersByTime(TOAST_MS);
    expect(queue.getSnapshot().toast?.message).toBe("Third");
  });

  it("notifies subscribers only when what is shown changes", () => {
    const queue = createNoticeQueue();
    const listener = vi.fn();
    queue.subscribe(listener);
    queue.showBanner(note);
    queue.showBanner(meal); // waits: nothing visible changes
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
