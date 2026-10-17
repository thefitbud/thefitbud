import { normalizeWhatsappE164 } from "@fitbud/core";

export type NormalizedIdentifier =
  | { kind: "email"; value: string }
  | { kind: "mobile"; value: string };

export function normalizeIdentifier(raw: string): NormalizedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return null;
    }
    return { kind: "email", value: email };
  }
  const digits = normalizeWhatsappE164(trimmed);
  if (!digits) {
    return null;
  }
  return { kind: "mobile", value: `+${digits}` };
}

import type { Db } from "../db/client.js";
import { userIdentities } from "../db/schema.js";

export async function findIdentityByIdentifierHash(
  db: Db,
  idHash: string,
): Promise<(typeof userIdentities.$inferSelect) | null> {
  const rows = await db.select().from(userIdentities);
  for (const row of rows) {
    if (row.emailNorm && (await identifierHash(row.emailNorm)) === idHash) {
      return row;
    }
    if (row.mobileE164 && (await identifierHash(row.mobileE164)) === idHash) {
      return row;
    }
  }
  return null;
}

export async function identifierHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
