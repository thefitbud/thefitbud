/**
 * Deterministic password hash for the QA accounts.
 *
 * `hashPassword` (`src/auth/password.ts`) draws a random salt, which is right for a
 * real account but would make `qa-seed.sql` different on every run; the same
 * reference date has to give a byte-identical file (D-QA1-3). The salt here is
 * derived from the password instead, with the same PBKDF2 parameters and the same
 * encoding, so the hash is read back by the production `verifyPassword` — the login
 * path is unchanged and nothing about password handling is weakened. The salt is a
 * SHA-256 digest of the password, so it reveals nothing about it, and only the hash
 * ever reaches the output file.
 */
import { createHash, pbkdf2Sync } from "node:crypto";
import { validatePasswordPlaintext } from "../../auth/password.js";

const ITERATIONS = 100_000;
const SALT_CONTEXT = "fitbud-qa-seed-salt:v1";

export function qaPasswordHash(password: string): string {
  const invalid = validatePasswordPlaintext(password);
  if (invalid) {
    throw new Error(`FITBUD_QA_PASSWORD rejected by the product rules: ${invalid}`);
  }
  const salt = createHash("sha256").update(`${SALT_CONTEXT}${password}`).digest().subarray(0, 16);
  const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`;
}
