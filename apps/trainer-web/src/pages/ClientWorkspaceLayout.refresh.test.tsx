/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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
  WorkspaceModals: ({ modal, onChanged }: { modal: unknown; onChanged: () => void }) =>
    modal ? (
      <div data-testid="screen-TW-34">
        <p role="status">Saved privately</p>
        <button type="button" onClick={onChanged}>
          Saved
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

describe("ClientWorkspaceLayout refresh", () => {
  it("keeps the workspace and an open drawer on screen while a save reloads it", async () => {
    api.getClientWorkspace.mockResolvedValue(workspaceFixture());
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });

    render(
      <MemoryRouter initialEntries={[`/clients/${REL_ID}/overview`]}>
        <Routes>
          <Route path="/clients/:relationshipId/*" element={<ClientWorkspaceLayout />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    expect(screen.getByTestId("screen-TW-34")).toBeTruthy();

    // The reload after a save stays pending: the drawer and its toast must survive it.
    let resolveReload: (value: unknown) => void = () => undefined;
    api.getClientWorkspace.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReload = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));

    expect(api.getClientWorkspace).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Loading client workspace/i)).toBeNull();
    expect(screen.getByTestId("screen-TW-34")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Saved privately");

    await act(async () => {
      resolveReload(workspaceFixture());
    });
    expect(screen.getByTestId("screen-TW-34")).toBeTruthy();
  });
});
