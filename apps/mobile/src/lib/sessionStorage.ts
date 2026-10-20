import { Platform } from "react-native";
import type { Role } from "@fitbud/contracts";

const TOKEN_KEY = "fitbud.accessToken";
const ROLE_KEY = "fitbud.selectedRole";

type SessionRole = Extract<Role, "trainee" | "trainer">;

function webStorage(): Storage | null {
  if (Platform.OS !== "web") return null;
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Persist trainee/trainer session across Expo web reloads. */
export function loadPersistedSession(): {
  accessToken: string | null;
  selectedRole: SessionRole | null;
} {
  const storage = webStorage();
  if (!storage) return { accessToken: null, selectedRole: null };
  const accessToken = storage.getItem(TOKEN_KEY);
  const roleRaw = storage.getItem(ROLE_KEY);
  const selectedRole: SessionRole | null =
    roleRaw === "trainee" || roleRaw === "trainer" ? roleRaw : null;
  return { accessToken, selectedRole };
}

export function persistSession(input: {
  accessToken: string | null;
  selectedRole: Role | null;
}): void {
  const storage = webStorage();
  if (!storage) return;
  if (input.accessToken) storage.setItem(TOKEN_KEY, input.accessToken);
  else storage.removeItem(TOKEN_KEY);
  if (
    input.selectedRole === "trainee" ||
    input.selectedRole === "trainer"
  ) {
    storage.setItem(ROLE_KEY, input.selectedRole);
  } else {
    storage.removeItem(ROLE_KEY);
  }
}

export function clearPersistedSession(): void {
  persistSession({ accessToken: null, selectedRole: null });
}
