import { afterEach, describe, expect, it, vi } from "vitest";
import { Animated, Platform, Text } from "react-native";
import { render, screen } from "../test/render";
import {
  COMPLETE_VELOCITY,
  EDGE_WIDTH,
  PushedScreen,
  createEdgeSwipeGesture,
  edgeSwipeOutcome,
  voiceOverProps,
} from "./PushedScreen";

const realOS = Platform.OS;
afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});

const WIDTH = 393;

describe("edgeSwipeOutcome", () => {
  it("completes past 35 % of the width", () => {
    expect(edgeSwipeOutcome(WIDTH * 0.35 + 1, 0, WIDTH)).toBe("complete");
  });
  it("cancels below 35 % with a slow release", () => {
    expect(edgeSwipeOutcome(WIDTH * 0.35 - 1, 100, WIDTH)).toBe("cancel");
    expect(edgeSwipeOutcome(0, 0, WIDTH)).toBe("cancel");
  });
  it("a flick above 500 pt/s completes even a short drag", () => {
    expect(edgeSwipeOutcome(40, COMPLETE_VELOCITY + 1, WIDTH)).toBe("complete");
    expect(edgeSwipeOutcome(40, COMPLETE_VELOCITY, WIDTH)).toBe("cancel");
  });
});

describe("edge swipe gesture", () => {
  function build() {
    const x = new Animated.Value(0);
    const onComplete = vi.fn();
    const gesture = createEdgeSwipeGesture({ width: WIDTH, x, onComplete }) as unknown as {
      config: Record<string, unknown>;
      handlers: Record<string, (event: unknown) => void>;
    };
    return { x, onComplete, gesture };
  }

  it("activates only from the left edge, horizontally", () => {
    const { gesture } = build();
    expect(gesture.config.hitSlop).toEqual({ left: 0, width: EDGE_WIDTH });
    expect(gesture.config.activeOffsetX).toBe(10);
    expect(gesture.config.failOffsetY).toEqual([-12, 12]);
  });

  it("follows the finger and never goes left of the edge", () => {
    const { x, gesture } = build();
    gesture.handlers.onUpdate!({ translationX: 120 });
    expect((x as unknown as { _value: number })._value).toBe(120);
    gesture.handlers.onUpdate!({ translationX: -30 });
    expect((x as unknown as { _value: number })._value).toBe(0);
  });

  it("above the threshold it animates out and calls onBack", () => {
    const start = vi.fn((cb?: () => void) => cb?.());
    vi.spyOn(Animated, "timing").mockReturnValue({ start } as never);
    const { gesture, onComplete } = build();
    gesture.handlers.onEnd!({ translationX: WIDTH * 0.5, velocityX: 0 });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("a flick completes", () => {
    const start = vi.fn((cb?: () => void) => cb?.());
    vi.spyOn(Animated, "timing").mockReturnValue({ start } as never);
    const { gesture, onComplete } = build();
    gesture.handlers.onEnd!({ translationX: 50, velocityX: 900 });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("below the threshold it springs back and does not go back", () => {
    const spring = vi
      .spyOn(Animated, "spring")
      .mockReturnValue({ start: vi.fn() } as never);
    const timing = vi.spyOn(Animated, "timing");
    const { gesture, onComplete } = build();
    gesture.handlers.onEnd!({ translationX: 60, velocityX: 100 });
    expect(spring).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("PushedScreen", () => {
  it("renders its content over the screen below", () => {
    render(
      <PushedScreen onBack={() => undefined} animateIn={false}>
        <Text>Log workout</Text>
      </PushedScreen>,
    );
    expect(screen.getByText("Log workout")).toBeTruthy();
    expect(screen.getByTestId("pushed-screen")).toBeTruthy();
  });

  it("renders without the edge pan on Android", () => {
    (Platform as { OS: string }).OS = "android";
    render(
      <PushedScreen onBack={() => undefined} animateIn={false}>
        <Text>Log workout</Text>
      </PushedScreen>,
    );
    expect(screen.getByText("Log workout")).toBeTruthy();
  });

  it("VoiceOver's two-finger scrub (accessibilityEscape) calls onBack", () => {
    const onBack = vi.fn();
    const props = voiceOverProps(onBack);
    expect(props.accessibilityViewIsModal).toBe(true);
    props.onAccessibilityEscape();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
