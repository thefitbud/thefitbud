import { sweepStaleTestDirs } from "./tmp-sweep.js";

// Runs once per `vitest run`, before any test file: removes seeded-DB temp dirs that an
// interrupted earlier run left behind. Live dirs of concurrently running suites are kept.
export default function setup(): void {
  const { removed } = sweepStaleTestDirs();
  if (removed.length > 0) {
    console.log(`[api tests] removed ${removed.length} stale seeded-DB temp dir(s)`);
  }
}
