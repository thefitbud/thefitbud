const ITERATIONS = 100_000;

const BREACHED = new Set(
  [
    "password",
    "123456",
    "12345678",
    "qwerty",
    "111111",
    "123456789",
    "letmein",
    "welcome",
    "admin",
    "iloveyou",
    "monkey",
    "dragon",
    "football",
    "baseball",
    "master",
    "sunshine",
    "princess",
    "fitbud",
    "fitbud-demo-2026",
  ].map((value) => value.toLowerCase()),
);

export function validatePasswordPlaintext(password: string): string | null {
  if (password.length < 8 || password.length > 64) {
    return "PASSWORD_LENGTH";
  }
  if (BREACHED.has(password.toLowerCase())) {
    return "PASSWORD_BREACHED";
  }
  return null;
}

/** User-facing copy for validatePasswordPlaintext codes. */
export function passwordRequirementMessage(code: string): string {
  if (code === "PASSWORD_BREACHED") {
    return "This password is too common.";
  }
  if (code === "PASSWORD_LENGTH") {
    return "Use a password between 8 and 64 characters.";
  }
  return "Password does not meet requirements.";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  const hash = new Uint8Array(derived);
  return `pbkdf2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const salt = base64ToBytes(parts[2]!);
  const expected = base64ToBytes(parts[3]!);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    expected.length * 8,
  );
  const actual = new Uint8Array(derived);
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i]! ^ expected[i]!;
  }
  return diff === 0;
}
