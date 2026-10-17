import { createHash } from "node:crypto";

const NAMESPACE = "fitbud-demo-v1";

export function demoUuid(...parts: string[]): string {
  const hex = createHash("sha256")
    .update([NAMESPACE, ...parts].join("|"))
    .digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
