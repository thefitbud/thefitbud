import { describe, expect, it, vi } from "vitest";
import {
  isSensitiveLogKey,
  redactForLog,
  safeRequestPath,
  serializeSafeLog,
  writeStructuredLog,
} from "./log.js";

describe("structured log redaction", () => {
  it("flags prohibited field names", () => {
    expect(isSensitiveLogKey("authorization")).toBe(true);
    expect(isSensitiveLogKey("idToken")).toBe(true);
    expect(isSensitiveLogKey("answers")).toBe(true);
    expect(isSensitiveLogKey("notes")).toBe(true);
    expect(isSensitiveLogKey("uploadUrl")).toBe(true);
    expect(isSensitiveLogKey("downloadUrl")).toBe(true);
    expect(isSensitiveLogKey("objectKey")).toBe(true);
    expect(isSensitiveLogKey("requestId")).toBe(false);
    expect(isSensitiveLogKey("relationshipId")).toBe(false);
    expect(isSensitiveLogKey("status")).toBe(false);
  });

  it("redacts nested sensitive keys and signed URL strings", () => {
    const redacted = redactForLog({
      requestId: "req-1",
      answers: { goals: "lose fat", limitations: "knee" },
      notes: "Trainee felt tired",
      uploadUrl: "/files/abc/content?exp=1&sig=deadbeef",
      downloadUrl: "https://example/files/x?sig=abc",
      objectKey: "relationships/abc/media/raw.png",
      authorization: "Bearer secret-token",
      actorUserId: "user-1",
      status: 200,
    }) as Record<string, unknown>;

    expect(redacted.requestId).toBe("req-1");
    expect(redacted.actorUserId).toBe("user-1");
    expect(redacted.status).toBe(200);
    expect(redacted.answers).toBe("[redacted]");
    expect(redacted.notes).toBe("[redacted]");
    expect(redacted.uploadUrl).toBe("[redacted]");
    expect(redacted.downloadUrl).toBe("[redacted]");
    expect(redacted.objectKey).toBe("[redacted]");
    expect(redacted.authorization).toBe("[redacted]");
  });

  it("redacts string values that look like bearer tokens or signed URLs", () => {
    expect(redactForLog("Bearer abc.def.ghi")).toBe("[redacted]");
    expect(redactForLog("/files/x/content?exp=99&sig=cafe")).toBe("[redacted]");
    expect(redactForLog("cookie=fitbud_session=abc")).toBe("[redacted]");
    expect(redactForLog("plain-uuid-ok")).toBe("plain-uuid-ok");
  });

  it("serializes request logs without sensitive substrings", () => {
    const line = serializeSafeLog({
      level: "info",
      message: "request.completed",
      requestId: "r1",
      operation: "GET /me",
      status: 200,
      latencyMs: 12,
      actorType: "trainer",
      actorUserId: "u1",
    });
    expect(line).toContain('"requestId":"r1"');
    expect(line).not.toMatch(/Bearer|answers|sig=|notes/i);
  });

  it("strips query strings from request paths", () => {
    expect(safeRequestPath("/files/abc/content?exp=1&sig=deadbeef")).toBe(
      "/files/abc/content",
    );
    expect(safeRequestPath("https://app.example/api/me?token=nope")).toBe(
      "/api/me",
    );
  });

  it("writes JSON lines to the console writer", () => {
    const writer = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    writeStructuredLog(
      {
        level: "error",
        message: "Unhandled API error",
        requestId: "r2",
        errorName: "Error",
      },
      writer,
    );
    expect(writer.error).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writer.error.mock.calls[0]![0] as string) as {
      message: string;
      requestId: string;
    };
    expect(payload).toMatchObject({
      message: "Unhandled API error",
      requestId: "r2",
    });
  });
});
