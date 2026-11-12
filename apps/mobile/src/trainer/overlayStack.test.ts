import { describe, expect, it } from "vitest";
import { backOverlays, pushOverlay, startOverlays } from "./overlayStack";

type O = {
  kind: "client" | "checkin" | "exception";
  id: string;
  cold?: boolean;
  relationshipId?: string;
};
const client: O = { kind: "client", id: "rel-1" };
const checkin: O = { kind: "checkin", id: "chk-1", relationshipId: "rel-1" };
const coldCheckin: O = { kind: "checkin", id: "chk-2", cold: true };
const exception: O = { kind: "exception", id: "exc-1" };

describe("trainer detail back stack", () => {
  it("client page -> check-in review: Back returns to the client page", () => {
    const stack = pushOverlay(startOverlays(client), checkin);
    expect(backOverlays(stack)).toEqual({ kind: "stack", stack: [client] });
  });

  it("queue -> check-in review: Back returns to the queue (tab shows)", () => {
    expect(backOverlays(startOverlays(checkin))).toEqual({ kind: "stack", stack: [] });
  });

  it("cold deep link to a check-in: Back goes to the client page", () => {
    expect(backOverlays(startOverlays(coldCheckin), "rel-9")).toEqual({
      kind: "client",
      relationshipId: "rel-9",
    });
  });

  it("cold check-in whose client is unknown falls back to the tab", () => {
    expect(backOverlays(startOverlays(coldCheckin))).toEqual({ kind: "stack", stack: [] });
  });

  it("cold check-in that opened the client page, then Back from there, leaves", () => {
    const stack = pushOverlay(startOverlays(coldCheckin), client);
    expect(backOverlays(stack)).toEqual({ kind: "stack", stack: [coldCheckin] });
  });

  it("exception -> client -> check-in unwinds one screen at a time", () => {
    const stack = pushOverlay(pushOverlay(startOverlays(exception), client), checkin);
    let r = backOverlays(stack);
    expect(r).toEqual({ kind: "stack", stack: [exception, client] });
    r = backOverlays((r as { stack: O[] }).stack);
    expect(r).toEqual({ kind: "stack", stack: [exception] });
    expect(backOverlays((r as { stack: O[] }).stack)).toEqual({ kind: "stack", stack: [] });
  });

  it("never mutates the previous stack", () => {
    const stack = [client, checkin];
    pushOverlay(stack, exception);
    backOverlays(stack);
    expect(stack).toEqual([client, checkin]);
  });
});
