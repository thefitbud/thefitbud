import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the report contract (QT8, `docs/runbooks/qa-nightly.md`) expects the web suite:
 * `qa-results/web/junit.xml`, `qa-results/web/results.json`, screenshots under it and
 * `qa-results/logs/web.log`, all relative to the repository root. `QA_RESULTS_DIR`
 * moves the whole tree (the workflow can use an absolute path).
 */
export const QA_RESULTS_ROOT = process.env.QA_RESULTS_DIR
  ? path.resolve(process.env.QA_RESULTS_DIR)
  : path.resolve(here, "../../../../qa-results");

export const WEB_RESULTS_DIR = path.join(QA_RESULTS_ROOT, "web");
export const SCREENSHOT_DIR = path.join(WEB_RESULTS_DIR, "screenshots");
/** Playwright's own failure artifacts. Playwright empties this directory at the start of a run. */
export const OUTPUT_DIR = path.join(WEB_RESULTS_DIR, "test-output");
export const WEB_LOG_FILE = path.join(QA_RESULTS_ROOT, "logs", "web.log");
