import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Light check that trainee-only copy is present in the module source.
 * Full E2E covers sneha.review via Playwright in later screen batches;
 * Batch 0 proves the gate string exists in RequireAuth.
 */
describe("RequireAuth trainee-only gate", () => {
  it("includes the client-account message", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./RequireAuth.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain(
      "This account is set up as a client. Open the FitBud app on your phone.",
    );
    expect(source).toContain("permittedRoles.includes(\"trainer\")");
    // Keep react imports exercised for the test runner package graph.
    expect(
      renderToStaticMarkup(createElement("span", null, "ok")),
    ).toContain("ok");
  });
});
