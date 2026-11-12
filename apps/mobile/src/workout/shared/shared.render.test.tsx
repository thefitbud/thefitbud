import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { SetEntryHeader, SetEntryRow, SetKeypad } from "./index";
import { initialDraft, loadBody } from "./setEntry";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const pending = {
  id: "s1",
  order: 2,
  status: "pending",
  prescribedLoadLabel: "40 kg",
  prescribedReps: 8,
};

describe("SetEntryRow", () => {
  it("shows the draft, opens fields and completes only on the editing row", () => {
    const onOpenField = vi.fn();
    const onComplete = vi.fn();
    render(
      <SetEntryRow
        set={pending}
        isNow
        draft={initialDraft("40 kg", 8)}
        previousLabel="40 × 8"
        onOpenField={onOpenField}
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText("40 × 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set 2 load: 40 kg" }));
    expect(onOpenField).toHaveBeenCalledWith("load");
    fireEvent.click(screen.getByRole("button", { name: "Set 2 reps: 8" }));
    expect(onOpenField).toHaveBeenCalledWith("reps");
    fireEvent.click(screen.getByRole("button", { name: "Log set 2" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("marks an edited draft and labels bodyweight without a kg unit", () => {
    render(
      <SetEntryRow
        set={pending}
        isNow
        draft={{ load: "", reps: "8", bodyweight: true }}
        modified
        onOpenField={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByText("EDITED")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Set 2 load: Bodyweight" }),
    ).toBeTruthy();
  });

  it("disables the tick while paused and on rows that are not being edited", () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <SetEntryRow
        set={pending}
        isNow
        draft={initialDraft("40 kg", 8)}
        completeDisabled
        onOpenField={() => {}}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log set 2" }));
    rerender(
      <SetEntryRow
        set={pending}
        isNow={false}
        draft={initialDraft("40 kg", 8)}
        onOpenField={() => {}}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log set 2" }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows a logged set's actual values as static text", () => {
    render(
      <SetEntryRow
        set={{
          ...pending,
          status: "completed",
          actualLoadLabel: "42.5 kg",
          actualReps: 7,
        }}
        isNow={false}
        draft={initialDraft("40 kg", 8)}
        onOpenField={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByText("42.5")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set 2 logged" })).toBeTruthy();
  });

  it("renders the header with and without the Previous column", () => {
    const { rerender } = render(<SetEntryHeader />);
    expect(screen.getByText("Previous")).toBeTruthy();
    rerender(<SetEntryHeader showPrevious={false} />);
    expect(screen.queryByText("Previous")).toBeNull();
  });

  it("an untouched draft sends no load change", () => {
    expect(loadBody(initialDraft("40 kg", 8), "40 kg")).toEqual({
      actualLoadLabel: null,
    });
  });
});

describe("SetKeypad", () => {
  function setup(over: Partial<Parameters<typeof SetKeypad>[0]> = {}) {
    const props = {
      field: "load" as const,
      setOrder: 3,
      bodyweight: false,
      onBodyweightChange: vi.fn(),
      onKey: vi.fn(),
      onBackspace: vi.fn(),
      onStep: vi.fn(),
      onPrimary: vi.fn(),
      onClose: vi.fn(),
      ...over,
    };
    render(<SetKeypad {...props} />);
    return props;
  }

  it("types digits and a decimal point on the load keypad", () => {
    const p = setup();
    expect(screen.getByText("Set 3 · load")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Decimal point" }));
    expect(p.onKey).toHaveBeenNthCalledWith(1, "2");
    expect(p.onKey).toHaveBeenNthCalledWith(2, ".");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onBackspace).toHaveBeenCalled();
  });

  it("switches between kg and Bodyweight", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Bodyweight" }));
    expect(p.onBodyweightChange).toHaveBeenCalledWith(true);
  });

  it("is the reps keypad without a decimal point", () => {
    const p = setup({ field: "reps" });
    expect(screen.getByText("Set 3 · reps")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decimal point" }));
    expect(p.onKey).not.toHaveBeenCalled();
  });

  it("does not take kg digits on a bodyweight set", () => {
    const p = setup({ bodyweight: true });
    expect(screen.getByText("No weight used")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(p.onKey).not.toHaveBeenCalled();
  });

  it("closes from the handle", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close keypad" }));
    expect(p.onClose).toHaveBeenCalled();
  });
});
