/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { RealtimeEvent } from "@fitbud/contracts";
import { useRealtimeHints } from "./useRealtimeHints";

type Subscription = { close: () => void };

function fakeApi(): {
  client: FitBudApiClient;
  subscribed: string[];
  closed: number;
} {
  const subscribed: string[] = [];
  let closed = 0;
  const client = {
    subscribeRealtime(relationshipId: string): Subscription {
      subscribed.push(relationshipId);
      return {
        close: () => {
          closed += 1;
        },
      };
    },
  } as unknown as FitBudApiClient;
  return {
    client,
    subscribed,
    get closed() {
      return closed;
    },
  };
}

describe("useRealtimeHints", () => {
  afterEach(() => {
    cleanup();
  });

  function Probe({
    api,
    ids,
    onHint,
  }: {
    api: FitBudApiClient;
    ids: string | readonly string[] | null;
    onHint: (event: RealtimeEvent) => void;
  }) {
    useRealtimeHints(api, ids, onHint);
    return null;
  }

  it("subscribes once per relationship id", () => {
    const api = fakeApi();
    render(<Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={vi.fn()} />);
    expect(api.subscribed).toEqual(["rid-1", "rid-2"]);
  });

  it("subscribes for a single id passed as a string", () => {
    const api = fakeApi();
    render(<Probe api={api.client} ids="rid-1" onHint={vi.fn()} />);
    expect(api.subscribed).toEqual(["rid-1"]);
  });

  it("does not subscribe without ids", () => {
    const api = fakeApi();
    render(<Probe api={api.client} ids={null} onHint={vi.fn()} />);
    render(<Probe api={api.client} ids={[]} onHint={vi.fn()} />);
    expect(api.subscribed).toEqual([]);
  });

  // Callers build the id array inline (HomePage spreads a Map's keys), so a new
  // array arrives on every render. The effect must key off the ids themselves,
  // not the array identity, or every render tore the sockets down and reopened
  // them.
  it("keeps the same sockets when re-rendered with an equal but new id array", () => {
    const api = fakeApi();
    const onHint = vi.fn();
    const { rerender } = render(
      <Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={onHint} />,
    );
    expect(api.subscribed).toHaveLength(2);

    for (let i = 0; i < 5; i += 1) {
      rerender(<Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={onHint} />);
    }

    expect(api.subscribed).toEqual(["rid-1", "rid-2"]);
    expect(api.closed).toBe(0);
  });

  it("keeps the same sockets when only the onHint callback changes identity", () => {
    const api = fakeApi();
    const { rerender } = render(
      <Probe api={api.client} ids={["rid-1"]} onHint={vi.fn()} />,
    );
    rerender(<Probe api={api.client} ids={["rid-1"]} onHint={vi.fn()} />);
    expect(api.subscribed).toEqual(["rid-1"]);
    expect(api.closed).toBe(0);
  });

  it("resubscribes when the ids actually change", () => {
    const api = fakeApi();
    const onHint = vi.fn();
    const { rerender } = render(<Probe api={api.client} ids={["rid-1"]} onHint={onHint} />);
    rerender(<Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={onHint} />);
    expect(api.subscribed).toEqual(["rid-1", "rid-1", "rid-2"]);
    expect(api.closed).toBe(1);
  });

  // HomePage rebuilds its id array from the clients-list response, which can
  // come back in a different order; that is the same set, not a new one.
  it("keeps the same sockets when the ids arrive in a different order", () => {
    const api = fakeApi();
    const onHint = vi.fn();
    const { rerender } = render(
      <Probe api={api.client} ids={["rid-2", "rid-1"]} onHint={onHint} />,
    );
    expect(api.subscribed).toHaveLength(2);
    rerender(<Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={onHint} />);
    expect(api.subscribed).toHaveLength(2);
    expect(api.closed).toBe(0);
  });

  it("opens one socket per relationship when an id is repeated", () => {
    const api = fakeApi();
    render(<Probe api={api.client} ids={["rid-1", "rid-1"]} onHint={vi.fn()} />);
    expect(api.subscribed).toEqual(["rid-1"]);
  });

  it("closes every socket on unmount", () => {
    const api = fakeApi();
    const { unmount } = render(
      <Probe api={api.client} ids={["rid-1", "rid-2"]} onHint={vi.fn()} />,
    );
    unmount();
    expect(api.closed).toBe(2);
  });
});
