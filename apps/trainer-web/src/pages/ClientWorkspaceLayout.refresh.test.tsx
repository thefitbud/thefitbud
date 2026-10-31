/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const REL_ID = "66666666-6666-4666-8666-666666666666";

const api = vi.hoisted(() => ({
  getClientWorkspace: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));
vi.mock("../lib/shell-title", () => ({ setShellClientTitle: () => undefined }));
vi.mock("../components/OfflineBanner", () => ({ useOnlineStatus: () => true }));
vi.mock("../components/workspace/WorkspaceHeader", () => ({
  WorkspaceHeader: ({ onOpenModal }: { onOpenModal: (modal: { type: "note" }) => void }) => (
    <button type="button" onClick={() => onOpenModal({ type: "note" })}>
      Add note
    </button>
  ),
}));
vi.mock("../components/workspace/WorkspaceModals", () => ({
  WorkspaceModals: ({
    modal,
    onChanged,
    onNoteSaved,
  }: {
    modal: unknown;
    onChanged: () => void;
    onNoteSaved: (message: string) => void;
  }) =>
    modal ? (
      <div data-testid="screen-TW-34">
        <button type="button" onClick={onChanged}>
          Other change
        </button>
        <button type="button" onClick={() => onNoteSaved("Saved privately")}>
          Save note
        </button>
      </div>
    ) : null,
}));

import { ClientWorkspaceLayout } from "./ClientWorkspaceLayout";

function workspaceFixture() {
  return {
    header: {
      traineeDisplayName: "Rohan Mehta",
      onboardingStatus: "active",
      traineeProfile: { gender: "male" },
      effectivePlan: null,
      clientWhatsappE164: null,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/overview`]}>
      <Routes>
        <Route path="/clients/:relationshipId/*" element={<ClientWorkspaceLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The next workspace reload stays pending until the returned resolver runs. */
function holdNextReload(): () => Promise<void> {
  let resolveReload: (value: unknown) => void = () => undefined;
  api.getClientWorkspace.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveReload = resolve;
    }),
  );
  return async () => {
    await act(async () => {
      resolveReload(workspaceFixture());
    });
  };
}

describe("ClientWorkspaceLayout refresh", () => {
  beforeEach(() => {
    api.getClientWorkspace.mockResolvedValue(workspaceFixture());
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the workspace and an open drawer on screen while a change reloads it (#88)", async () => {
    renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    const finishReload = holdNextReload();
    fireEvent.click(screen.getByRole("button", { name: "Other change" }));

    expect(api.getClientWorkspace).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Loading client workspace/i)).toBeNull();
    expect(screen.getByTestId("screen-TW-34")).toBeTruthy();
    await finishReload();
    expect(screen.getByTestId("screen-TW-34")).toBeTruthy();
  });

  it("closes the drawer on a note save and shows the toast through the reload (TW-34)", async () => {
    renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    const finishReload = holdNextReload();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(api.getClientWorkspace).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("screen-TW-34")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Saved privately");
    await finishReload();
    expect(screen.getByRole("status").textContent).toBe("Saved privately");
  });

  it("hides the toast after 4 s, and a repeated save restarts the 4 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("status").textContent).toBe("Saved privately");

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    // Same copy again: the timer restarts instead of expiring 1 s later.
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByRole("status").textContent).toBe("Saved privately");

    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
