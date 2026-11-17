/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";

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
  WorkspaceHeader: () => <div data-testid="workspace-header" />,
}));
vi.mock("../components/workspace/WorkspaceModals", () => ({
  WorkspaceModals: () => null,
}));

import { ClientWorkspaceLayout } from "./ClientWorkspaceLayout";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
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

describe("ClientWorkspaceLayout system states", () => {
  it("shows ForbiddenState on 403", async () => {
    api.getClientWorkspace.mockRejectedValue(
      new ApiClientError({
        status: 403,
        code: "FORBIDDEN",
        message: "Forbidden.",
        requestId: "req-403",
      }),
    );
    await act(async () => {
      renderLayout();
    });
    await waitFor(() => {
      expect(screen.getByTestId("forbidden-state")).toBeTruthy();
    });
    expect(
      screen.getByRole("heading", {
        name: /you don't have access to this client/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/client not found/i)).toBeNull();
  });

  it("shows NotFoundState on 404", async () => {
    api.getClientWorkspace.mockRejectedValue(
      new ApiClientError({
        status: 404,
        code: "NOT_FOUND",
        message: "Not found.",
        requestId: "req-404",
      }),
    );
    await act(async () => {
      renderLayout();
    });
    await waitFor(() => {
      expect(screen.getByTestId("not-found-state")).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: /go to clients/i }),
    ).toBeTruthy();
  });

  it("shows centred ErrorState on server failure", async () => {
    api.getClientWorkspace.mockRejectedValue(
      new ApiClientError({
        status: 500,
        code: "INTERNAL",
        message: "Please retry in a moment. If it keeps happening, email support.",
        requestId: "req-500",
      }),
    );
    await act(async () => {
      renderLayout();
    });
    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeTruthy();
    });
    expect(
      screen.getByRole("heading", { name: /couldn't load this page/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeTruthy();
  });
});
