import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { WEB_LOG_FILE } from "./paths.js";

/**
 * Writes the web suite's log to `qa-results/logs/web.log` (QT8 contract). The summarizer
 * redacts it again, but this file is published, so secrets are removed here too: the
 * values of the two QA variables and of any variable whose name ends in TOKEN, SECRET,
 * PASSWORD or KEY. One line per test, plus the first line of any error. No page content.
 */

function secretValues(): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 6) continue;
    if (name === "QA_TEST_OTP_CODE" || /(TOKEN|SECRET|PASSWORD|KEY)$/.test(name)) values.add(value);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

export function redact(text: string, secrets: string[] = secretValues()): string {
  let out = text.replace(ANSI, "");
  for (const secret of secrets) out = out.split(secret).join("[redacted]");
  return out;
}

export default class LogReporter implements Reporter {
  private secrets: string[] = [];

  private write(line: string): void {
    appendFileSync(WEB_LOG_FILE, `${redact(line, this.secrets)}\n`);
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.secrets = secretValues();
    mkdirSync(path.dirname(WEB_LOG_FILE), { recursive: true });
    writeFileSync(WEB_LOG_FILE, "");
    this.write(`web suite: ${suite.allTests().length} tests`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.titlePath().slice(2).join(" > ");
    this.write(`${result.status.toUpperCase()} ${title} (${result.duration} ms)`);
    for (const note of test.annotations) {
      if (note.type === "skip" && note.description) this.write(`  ${note.description}`);
    }
    const first = result.errors[0]?.message?.split("\n")[0];
    if (first) this.write(`  ${first.slice(0, 400)}`);
  }

  onEnd(result: FullResult): void {
    this.write(`web suite finished: ${result.status}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
