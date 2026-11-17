import { useState } from "react";
import { AccessibilityInfo, Animated, Pressable, Text as RNText } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Snackbar } from "../Snackbar";
import { EXIT_FALLBACK_MS, NoticeHost, swipeDismisses } from "./NoticeHost";
import { BANNER_MS, TOAST_ACTION_MS, createNoticeQueue, type NoticeQueue } from "./noticeQueue";

const NOTE = {
  key: "note:00000000-0000-4000-8000-0000000c0002",
  title: "Rahul has a note for you",
  body: "Try 42.5 kg on the RDLs today if set 2 feels easy.",
  leading: { kind: "initials" as const, name: "Rahul Verma", tone: "coach" as const },
  openLabel: "Open",
};

let reduceMotion = false;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function touch(el: Element, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number, t: number) {
  const point = { identifier: 1, target: el, pageX: x, pageY: y, clientX: x, clientY: y, screenX: x, screenY: y };
  const touches = type === "touchEnd" ? [] : [point];
  fireEvent[type](el, { touches, changedTouches: [point], targetTouches: touches, timeStamp: t });
}

describe("NoticeHost (Z12-38)", () => {
  let queue: NoticeQueue;
  let announce: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    queue = createNoticeQueue();
    reduceMotion = false;
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(async () => reduceMotion);
    announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderHost(children: React.ReactNode = null) {
    return render(<NoticeHost queue={queue}>{children}</NoticeHost>);
  }

  it("shows the banner, announces it, and removes it after about 4 s", async () => {
    renderHost();
    await settle();
    act(() => {
      queue.showBanner(NOTE);
    });
    expect(screen.getByText("Rahul has a note for you")).toBeTruthy();
    expect(screen.getByText(NOTE.body)).toBeTruthy();
    expect(screen.getByText("RV")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(`Rahul has a note for you. ${NOTE.body}`);
    act(() => {
      vi.advanceTimersByTime(BANNER_MS);
    });
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("the banner leaves the screen even if its slide-out never reports back", async () => {
    // An animation whose end callback never comes must not keep a banner the
    // queue has already moved past.
    vi.spyOn(Animated, "timing").mockImplementation(
      () => ({ start: () => undefined, stop: () => undefined, reset: () => undefined }) as never,
    );
    renderHost();
    await settle();
    act(() => {
      queue.showBanner(NOTE);
    });
    expect(screen.getByText("Rahul has a note for you")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(BANNER_MS);
    });
    expect(queue.getSnapshot().banner).toBeNull();
    act(() => {
      vi.advanceTimersByTime(EXIT_FALLBACK_MS);
    });
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
  });

  it("a tap opens the target", async () => {
    const onOpen = vi.fn();
    renderHost();
    await settle();
    act(() => {
      queue.showBanner({ ...NOTE, onOpen });
    });
    fireEvent.click(screen.getByRole("button", { name: `Rahul has a note for you. ${NOTE.body}` }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("with reduced motion the banner appears at once and a swipe up removes it at once", async () => {
    reduceMotion = true;
    const onDismiss = vi.fn();
    renderHost();
    await settle();
    act(() => {
      queue.showBanner({ ...NOTE, onDismiss });
    });
    const banner = screen.getByTestId("notice-banner");
    // No entrance animation: fully opaque, in place.
    expect(getComputedStyle(banner.parentElement!).opacity).toBe("1");
    touch(banner, "touchStart", 100, 120, 0);
    touch(banner, "touchMove", 100, 100, 16);
    touch(banner, "touchMove", 100, 60, 32);
    touch(banner, "touchEnd", 100, 60, 48);
    expect(onDismiss).toHaveBeenCalledWith("swipe");
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
  });

  it("a swipe up takes the banner off the queue on release, even if the fling never reports back", async () => {
    // A native animation whose end callback never comes must not leave the
    // banner held (its timer paused) with everything queued behind it.
    vi.spyOn(Animated, "timing").mockImplementation(
      () => ({ start: () => undefined, stop: () => undefined, reset: () => undefined }) as never,
    );
    const onDismiss = vi.fn();
    renderHost();
    await settle();
    act(() => {
      queue.showBanner({ ...NOTE, onDismiss });
      queue.showBanner({ ...NOTE, key: "note:second", title: "Second note" });
    });
    const banner = screen.getByTestId("notice-banner");
    touch(banner, "touchStart", 100, 120, 0);
    touch(banner, "touchMove", 100, 100, 16);
    touch(banner, "touchMove", 100, 60, 32);
    touch(banner, "touchEnd", 100, 60, 48);
    expect(onDismiss).toHaveBeenCalledWith("swipe");
    expect(queue.getSnapshot().banner?.title).toBe("Second note");
    act(() => {
      vi.advanceTimersByTime(EXIT_FALLBACK_MS);
    });
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
    expect(screen.getByText("Second note")).toBeTruthy();
  });

  it("a small drag does not dismiss", () => {
    expect(swipeDismisses(-10, -0.1)).toBe(false);
    expect(swipeDismisses(30, 1)).toBe(false);
    expect(swipeDismisses(-30, 0)).toBe(true);
    expect(swipeDismisses(-8, -0.9)).toBe(true);
  });

  describe("Snackbar inside the host", () => {
    function UndoScreen({ onUndo }: { onUndo: () => void }) {
      const [toast, setToast] = useState<string | null>(null);
      return (
        <>
          <Pressable accessibilityRole="button" onPress={() => setToast("Evening snack logged as planned")}>
            <RNText>Eaten as planned</RNText>
          </Pressable>
          <RNText>Meals</RNText>
          {toast ? (
            <Snackbar
              leadingCheck
              message={toast}
              actionLabel="Undo"
              onAction={onUndo}
              onDismiss={() => setToast(null)}
            />
          ) : null}
        </>
      );
    }

    it("an Undo toast stays 6 s and calls onDismiss", async () => {
      renderHost(<UndoScreen onUndo={vi.fn()} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Eaten as planned" }));
      expect(screen.getByText("Evening snack logged as planned")).toBeTruthy();
      expect(announce).toHaveBeenCalledWith("Evening snack logged as planned");
      act(() => {
        vi.advanceTimersByTime(TOAST_ACTION_MS - 1);
      });
      expect(screen.getByText("Evening snack logged as planned")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByText("Evening snack logged as planned")).toBeNull();
    });

    it("Undo runs the action and the toast leaves", async () => {
      const onUndo = vi.fn();
      renderHost(<UndoScreen onUndo={onUndo} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Eaten as planned" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Evening snack logged as planned")).toBeNull();
    });

    it("a tap outside closes it; a tap on it does not", async () => {
      renderHost(<UndoScreen onUndo={vi.fn()} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Eaten as planned" }));
      const toast = screen.getByTestId("notice-toast");
      touch(toast, "touchStart", 50, 700, 0);
      touch(toast, "touchEnd", 50, 700, 40);
      expect(screen.getByText("Evening snack logged as planned")).toBeTruthy();

      const outside = screen.getByText("Meals");
      touch(outside, "touchStart", 50, 300, 100);
      touch(outside, "touchEnd", 50, 300, 140);
      expect(screen.queryByText("Evening snack logged as planned")).toBeNull();
    });

    it("a toast is announced once, with no live region as well", async () => {
      renderHost(<UndoScreen onUndo={vi.fn()} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Eaten as planned" }));
      expect(announce.mock.calls.filter(([text]: unknown[]) => text === "Evening snack logged as planned")).toHaveLength(1);
      expect(screen.getByTestId("notice-toast").getAttribute("aria-live")).toBeNull();
    });

    /** AttentionTab's shape: same words for each answer, inline Undo, no onDismiss. */
    function AnswerScreen({ onUndo }: { onUndo: (client: string) => void }) {
      const [client, setClient] = useState<string | null>(null);
      return (
        <>
          <Pressable accessibilityRole="button" onPress={() => setClient("A")}>
            <RNText>Answer A</RNText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setClient("B")}>
            <RNText>Answer B</RNText>
          </Pressable>
          {client ? (
            <Snackbar leadingCheck message="Marked answered" actionLabel="Undo" onAction={() => onUndo(client)} />
          ) : null}
        </>
      );
    }

    it("the same toast asked for again keeps the new Undo reachable", async () => {
      const onUndo = vi.fn();
      renderHost(<AnswerScreen onUndo={onUndo} />);
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "Answer A" }));
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      fireEvent.click(screen.getByRole("button", { name: "Answer B" }));
      // Past A's 6 s: B's request started the time over.
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Marked answered")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(onUndo).toHaveBeenCalledWith("B");
      expect(screen.queryByText("Marked answered")).toBeNull();
    });

    it("re-renders can't keep a toast up past twice its time", async () => {
      function Rerendering() {
        const [n, setN] = useState(0);
        return (
          <>
            <Pressable accessibilityRole="button" onPress={() => setN(n + 1)}>
              <RNText>Tick {n}</RNText>
            </Pressable>
            <Snackbar message="Marked answered" actionLabel="Undo" onAction={() => undefined} />
          </>
        );
      }
      renderHost(<Rerendering />);
      await settle();
      for (let i = 0; i < 4; i += 1) {
        act(() => {
          vi.advanceTimersByTime(2900);
        });
        fireEvent.click(screen.getByRole("button", { name: `Tick ${i}` }));
      }
      // 11.6 s in, still up; gone by 12 s from when it came up.
      expect(screen.getByText("Marked answered")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByText("Marked answered")).toBeNull();
      // Once gone, a re-render does not bring it back.
      fireEvent.click(screen.getByRole("button", { name: "Tick 4" }));
      expect(screen.queryByText("Marked answered")).toBeNull();
    });

    it("two toasts show one at a time", async () => {
      renderHost(
        <>
          <Snackbar message="Link copied" />
          <Snackbar message="Note saved" />
        </>,
      );
      await settle();
      expect(screen.getByText("Link copied")).toBeTruthy();
      expect(screen.queryByText("Note saved")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText("Link copied")).toBeNull();
      expect(screen.getByText("Note saved")).toBeTruthy();
    });
  });

  it("outside a host a Snackbar draws in place, as before", () => {
    render(<Snackbar message="Meal logged" actionLabel="Undo" onAction={vi.fn()} />);
    expect(screen.getByText("Meal logged")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Meal logged")).toBeTruthy();
  });
});
