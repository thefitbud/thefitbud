import type { RealtimeEvent } from "@fitbud/contracts";
import { realtimeEventSchema } from "@fitbud/contracts";
import type { Env } from "../types";

/**
 * Durable Object room keyed by coaching relationship id.
 *
 * Fans out compact change hints to connected trainer/trainee sockets.
 * Does not store domain state — REST/sync remain authoritative.
 *
 * Hibernation WebSocket API: acceptWebSocket + webSocketMessage/Close.
 */
export class RelationshipRealtimeRoom {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const body = await request.json().catch(() => null);
      const parsed = realtimeEventSchema.safeParse(body);
      if (!parsed.success) {
        return new Response("Invalid realtime event", { status: 400 });
      }
      this.fanOut(parsed.data);
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const userId = request.headers.get("x-fitbud-user-id") ?? "unknown";
    this.ctx.acceptWebSocket(server, [userId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // Clients may send ping text; auto-response handles the dedicated ping pair.
    // Ignore application messages — realtime is server→client hints only.
    void ws;
    void message;
    void this.env;
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    void wasClean;
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  private fanOut(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Drop broken sockets; hibernation cleanup handles the rest.
      }
    }
  }
}
