import { describe, expect, it } from "vitest";
import { invitePublicUrl, publicAppOrigin } from "./public-app-url.js";

describe("publicAppOrigin", () => {
  it("uses http for local ENVIRONMENT", () => {
    expect(
      publicAppOrigin({ APP_HOST: "localhost:5173", ENVIRONMENT: "local" }),
    ).toBe("http://localhost:5173");
  });

  it("uses https outside local", () => {
    expect(
      publicAppOrigin({ APP_HOST: "app.fitbud.test", ENVIRONMENT: "production" }),
    ).toBe("https://app.fitbud.test");
  });

  it("preserves an explicit scheme", () => {
    expect(
      publicAppOrigin({
        APP_HOST: "http://127.0.0.1:5173",
        ENVIRONMENT: "production",
      }),
    ).toBe("http://127.0.0.1:5173");
  });
});

describe("invitePublicUrl", () => {
  it("builds /i/{token} on the public origin", () => {
    expect(
      invitePublicUrl(
        { APP_HOST: "localhost:5173", ENVIRONMENT: "local" },
        "abc123",
      ),
    ).toBe("http://localhost:5173/i/abc123");
  });
});
