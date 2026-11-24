import { describe, expect, it } from "vitest";
import { localMigrateCommands, optimizeSql, PRAGMA_OPTIMIZE } from "./d1-optimize.js";

describe("d1-optimize (Z14-4)", () => {
  it("passes the statement as one argument, quoted only where the shell would split it", () => {
    expect(PRAGMA_OPTIMIZE).toBe("PRAGMA optimize");
    expect(optimizeSql("linux")).toBe("PRAGMA optimize");
    expect(optimizeSql("darwin")).toBe("PRAGMA optimize");
    expect(optimizeSql("win32")).toBe('"PRAGMA optimize"');
  });

  it("migrates the local database, then optimizes the same one", () => {
    expect(localMigrateCommands("linux")).toEqual([
      ["exec", "wrangler", "d1", "migrations", "apply", "fitbud", "--local", "--persist-to", ".wrangler/state"],
      [
        "exec", "wrangler", "d1", "execute", "fitbud", "--local", "--persist-to", ".wrangler/state",
        "--command", "PRAGMA optimize",
      ],
    ]);
  });
});
