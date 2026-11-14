/**
 * ClientsTab and the trainer offline cache (Z12-33): a roster load started for
 * trainer A that resolves after A signs out and B signs in writes nothing
 * under B. Real screen, real cache module; only the API client is replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientDirectoryListResponseSchema,
  type ClientDirectoryListResponse,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const api = {
  listClients: vi.fn(),
  getAttentionGroups: vi.fn(async () => ({ groups: [], needsYou: [], reviewed: [] })),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer" });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { ClientsTab } = await import("./ClientsTab");
const { clearTrainerCache, readTrainerCache, setTrainerCacheOwner } = await import("./cache");

const TRAINER_A = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const TRAINER_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";

const rosterA: ClientDirectoryListResponse = clientDirectoryListResponseSchema.parse({
  items: [
    {
      relationshipId: "6a68b615-c47c-4bfc-a7f8-550becf7878a",
      invitationId: null,
      traineeDisplayName: "Rohan Mehta",
      status: "coaching_ready",
      goalShort: "Lose 4 kg",
      nextCheckin: null,
      effectivePlan: null,
      adherenceState: "on_track",
      renewalState: null,
      renewsOn: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      endedAt: null,
      updatedAt: "2026-11-10T04:00:00.000Z",
    },
  ],
  nextCursor: null,
});

beforeEach(() => {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER_A);
  api.listClients.mockReset();
});

describe("ClientsTab cache writes", () => {
  it("a load started for trainer A that resolves after B signs in writes nothing under B (Z12-33)", async () => {
    let resolveRoster: (value: ClientDirectoryListResponse) => void = () => undefined;
    const pending = new Promise<ClientDirectoryListResponse>((resolve) => {
      resolveRoster = resolve;
    });
    api.listClients.mockReturnValue(pending);
    render(<ClientsTab onOpenClient={vi.fn()} />);
    // The load starts after the screen's 300 ms search debounce.
    await waitFor(() => expect(api.listClients).toHaveBeenCalled());

    // A signs out and B signs in while A's fetch is still in flight, in the
    // order AuthProvider runs them (sign-out clear, then B's `/me`).
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_B);

    resolveRoster(rosterA);
    // The row on screen proves the load reached its cache write.
    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    expect(readTrainerCache("trainer:clients")).toBeNull();
    for (let index = 0; index < localStorage.length; index += 1) {
      expect(localStorage.key(index)?.startsWith("trainer:")).toBe(false);
    }
  });

  it("a load that resolves for the same trainer still writes the roster", async () => {
    api.listClients.mockResolvedValue(rosterA);
    render(<ClientsTab onOpenClient={vi.fn()} />);

    expect(await screen.findByText("Rohan Mehta")).toBeTruthy();
    expect(readTrainerCache<{ items: unknown[] }>("trainer:clients")?.items).toHaveLength(1);
  });
});
