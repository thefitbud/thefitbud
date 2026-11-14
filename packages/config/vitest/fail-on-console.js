/**
 * vitest setup file: fails any test that calls console.error (Z12-35, D-W12-28).
 * Every workspace's vitest config lists it in `setupFiles`; the rules and the
 * allow-list are in ./console-gate.js.
 */
import { afterEach, beforeEach } from "vitest";
import { startConsoleGate } from "./console-gate.js";

/** @type {(() => void) | null} */
let finish = null;

beforeEach(() => {
  finish = startConsoleGate();
});

afterEach(() => {
  const done = finish;
  finish = null;
  done?.();
});
