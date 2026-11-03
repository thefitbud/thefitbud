/**
 * Thin wrapper over `expo-secure-store` (OS keychain / keystore). Native only:
 * the module is loaded lazily so the web bundle and node tests never touch it.
 * Tests replace this whole module with an in-memory map.
 *
 * Never log a value from here; key names and outcomes only.
 */

type SecureStoreModule = typeof import("expo-secure-store");

let loaded: Promise<SecureStoreModule> | null = null;

function secureStore(): Promise<SecureStoreModule> {
  loaded ??= import("expo-secure-store");
  return loaded;
}

export async function secureGet(key: string): Promise<string | null> {
  const store = await secureStore();
  return store.getItemAsync(key, { keychainAccessible: store.AFTER_FIRST_UNLOCK });
}

export async function secureSet(key: string, value: string): Promise<void> {
  const store = await secureStore();
  await store.setItemAsync(key, value, { keychainAccessible: store.AFTER_FIRST_UNLOCK });
}

export async function secureDelete(key: string): Promise<void> {
  const store = await secureStore();
  await store.deleteItemAsync(key, { keychainAccessible: store.AFTER_FIRST_UNLOCK });
}
