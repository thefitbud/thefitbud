import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BackHandler, Platform } from "react-native";
import { act, render } from "../test/render";
import { useHardwareBack } from "./useHardwareBack";

function Node({
  handler,
  enabled,
  children,
}: {
  handler: () => boolean | void;
  enabled?: boolean;
  children?: ReactNode;
}) {
  useHardwareBack(handler, enabled);
  return <>{children}</>;
}

const realOS = Platform.OS;
let listener: (() => boolean) | null = null;
let add: ReturnType<typeof vi.spyOn>;
const remove = vi.fn();
const press = (): boolean => {
  let consumed = false;
  act(() => {
    consumed = listener?.() ?? false;
  });
  return consumed;
};

beforeEach(() => {
  listener = null;
  remove.mockClear();
  add = vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    handler: () => boolean,
  ) => {
    listener = handler;
    return { remove };
  }) as never);
  (Platform as { OS: string }).OS = "android";
});
afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});

describe("useHardwareBack", () => {
  it("runs the most recently mounted handler first; true consumes the press", () => {
    const calls: string[] = [];
    render(
      <Node handler={() => void calls.push("parent")}>
        <Node handler={() => void calls.push("child")} />
      </Node>,
    );
    expect(press()).toBe(true);
    expect(calls).toEqual(["child"]);
  });

  it("a handler returning false hands the press to the next one", () => {
    const calls: string[] = [];
    render(
      <Node
        handler={() => {
          calls.push("parent");
          return true;
        }}
      >
        <Node
          handler={() => {
            calls.push("child");
            return false;
          }}
        />
      </Node>,
    );
    expect(press()).toBe(true);
    expect(calls).toEqual(["child", "parent"]);
  });

  it("no handler consumes it: not handled, so Android's default runs", () => {
    render(<Node handler={() => false} />);
    expect(press()).toBe(false);
  });

  it("skips a handler while enabled is false", () => {
    const child = vi.fn(() => true);
    const parent = vi.fn(() => true);
    const { rerender } = render(
      <Node handler={parent}>
        <Node handler={child} enabled={false} />
      </Node>,
    );
    press();
    expect(child).not.toHaveBeenCalled();
    expect(parent).toHaveBeenCalledTimes(1);
    rerender(
      <Node handler={parent}>
        <Node handler={child} enabled />
      </Node>,
    );
    press();
    expect(child).toHaveBeenCalledTimes(1);
  });

  it("uses the latest handler without re-registering", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { rerender } = render(<Node handler={first} />);
    rerender(<Node handler={second} />);
    press();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("removes the listener when the last handler unmounts", () => {
    const { unmount } = render(<Node handler={() => true} />);
    expect(remove).not.toHaveBeenCalled();
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does nothing on iOS", () => {
    (Platform as { OS: string }).OS = "ios";
    render(<Node handler={() => true} />);
    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing on web", () => {
    (Platform as { OS: string }).OS = "web";
    render(<Node handler={() => true} />);
    expect(add).not.toHaveBeenCalled();
  });
});
