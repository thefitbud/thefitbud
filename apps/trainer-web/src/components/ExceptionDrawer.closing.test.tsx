/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import type { ExceptionDetail } from "@fitbud/contracts";

// DR1: once a close is requested the drawer's own single-key shortcuts must
// do nothing, however long the drawer stays mounted (the parent's close is a
// router navigation, which React renders as a transition).

const EXC_ID = "44444444-4444-4444-8444-444444444444";
const EXC_ID_2 = "77777777-7777-4777-8777-777777777777";
const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  getResponsiveness: vi.fn(),
  nudgeActivity: vi.fn(),
  acknowledgeException: vi.fn(),
  resolveException: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    nudgeActivity: api.nudgeActivity,
    acknowledgeException: api.acknowledgeException,
    resolveException: api.resolveException,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));
vi.mock("./OfflineBanner", () => ({ useOnlineStatus: () => true }));

import { ExceptionDrawer } from "./ExceptionDrawer";

const detail: ExceptionDetail = {
  id: EXC_ID,
  coachingRelationshipId: REL_ID,
  type: "missed_workout",
  severity: "attention",
  status: "acknowledged",
  ruleVersion: "v1",
  sourceEntityType: "workout_assignment",
  sourceEntityId: "66666666-6666-4666-8666-666666666666",
  summary: "Missed Upper body A",
  details: null,
  detectedAt: "2026-10-22T06:00:00.000Z",
  activatedAt: "2026-10-22T06:00:00.000Z",
  acknowledgedAt: "2026-10-22T07:00:00.000Z",
  resolvedAt: null,
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T07:00:00.000Z",
  actions: [],
};

/** Keys that must all be ignored once closing has started. */
const KEYS = ["n", "N", "Escape", "Tab"] as const;

/** Press every key on the focused element; true if none was handled. */
function pressAll(): boolean {
  let untouched = true;
  for (const key of KEYS) {
    const target = document.activeElement ?? document.body;
    // fireEvent returns false when a handler called preventDefault().
    if (!fireEvent.keyDown(target, { key })) untouched = false;
  }
  return untouched;
}

let assignSpy: ReturnType<typeof vi.fn>;
let realLocation: Location;

/** Parent whose close never unmounts the drawer (a stalled transition). */
async function renderStuck(onClose = vi.fn()) {
  const utils = render(
    <MemoryRouter>
      <ExceptionDrawer exceptionId={EXC_ID} onClose={onClose} />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Nudge" });
  return { ...utils, onClose };
}

type ClosePath = {
  name: string;
  close: (container: HTMLElement) => Promise<void> | void;
};

const CLOSE_PATHS: ClosePath[] = [
  {
    name: "Escape",
    close: () => {
      fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    },
  },
  {
    name: "X click",
    close: () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    },
  },
  {
    name: "backdrop click",
    close: (container) => {
      fireEvent.click(container.querySelector(".drawer-backdrop")!);
    },
  },
  {
    name: "Resolve",
    close: async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
      });
    },
  },
];

const NAV_PATHS: ClosePath[] = [
  {
    name: "overflow Adjust plan",
    close: () => {
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Adjust plan" }));
    },
  },
  {
    name: "overflow Open client",
    close: () => {
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Open client" }));
    },
  },
];

describe("ExceptionDrawer ignores shortcut keys once closing starts (DR1)", () => {
  beforeEach(() => {
    api.getException.mockImplementation(async (id: string) => ({
      ...detail,
      id,
    }));
    api.getWorkoutAssignment.mockResolvedValue({
      workoutDayName: "Upper body A",
      windowEndsAt: "2026-10-22T12:00:00.000Z",
      workoutDay: { exercises: [] },
    });
    api.getClientWorkspace.mockResolvedValue({
      header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
    });
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
    api.nudgeActivity.mockResolvedValue({});
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockResolvedValue({});
    realLocation = window.location;
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign: assignSpy },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("control: 'n' nudges while the drawer is open", async () => {
    await renderStuck();
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "n" });
    });
    expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
  });

  for (const path of CLOSE_PATHS) {
    it(`${path.name}: keys at 0 ms after the close request do nothing`, async () => {
      const { container, onClose } = await renderStuck();
      await path.close(container);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(pressAll()).toBe(true);
      await act(async () => {});
      expect(api.nudgeActivity).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it(`${path.name}: keys while the drawer is still mounted (16-1000 ms) do nothing`, async () => {
      const { container, onClose } = await renderStuck();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "Date"] });
      await path.close(container);
      let elapsed = 0;
      for (const at of [16, 50, 100, 250, 1000]) {
        act(() => {
          vi.advanceTimersByTime(at - elapsed);
        });
        elapsed = at;
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(pressAll()).toBe(true);
      }
      vi.useRealTimers();
      await act(async () => {});
      expect(api.nudgeActivity).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  }

  for (const path of NAV_PATHS) {
    it(`${path.name}: keys after leaving the page do nothing`, async () => {
      const { container, onClose } = await renderStuck();
      await path.close(container);
      expect(assignSpy).toHaveBeenCalledTimes(1);
      expect(pressAll()).toBe(true);
      await act(async () => {});
      expect(api.nudgeActivity).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  }

  it("error state Close button: a later Escape doesn't close again", async () => {
    api.getException.mockRejectedValue(new Error("gone"));
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ExceptionDrawer exceptionId={EXC_ID} onClose={onClose} />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    // Two buttons are named Close (the X and the error panel's); use the text one.
    const textClose = screen
      .getAllByRole("button", { name: "Close" })
      .find((b) => b.textContent === "Close")!;
    expect(textClose).toBeTruthy();
    fireEvent.click(textClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pressAll()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a new item in the same drawer after a close request works again", async () => {
    const onClose = vi.fn();
    const { rerender } = await renderStuck(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rerender(
      <MemoryRouter>
        <ExceptionDrawer exceptionId={EXC_ID_2} onClose={onClose} />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Nudge" });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "n" });
    });
    expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
  });

  // Real parent: the close is setSearchParams (a router transition). Keys
  // dispatched in the same act() land before the unmount commits.
  function RouterParent() {
    const [params, setParams] = useSearchParams();
    const id = params.get("exception");
    return id ? (
      <ExceptionDrawer
        exceptionId={id}
        onClose={() =>
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("exception");
            return next;
          })
        }
      />
    ) : null;
  }

  for (const path of CLOSE_PATHS) {
    it(`router parent, ${path.name}: 'n' in the same frame as the close doesn't nudge`, async () => {
      const { container } = render(
        <MemoryRouter initialEntries={[`/?exception=${EXC_ID}`]}>
          <RouterParent />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Nudge" });
      let stillMounted = false;
      await act(async () => {
        await path.close(container);
        // Inside act() the router transition hasn't committed yet.
        stillMounted = screen.queryByRole("dialog") !== null;
        pressAll();
      });
      expect(stillMounted).toBe(true);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(api.nudgeActivity).not.toHaveBeenCalled();
    });
  }
});
