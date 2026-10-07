const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Android emulator alias for the host machine's loopback interface. */
export const ANDROID_EMULATOR_HOST = "10.0.2.2";

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/** Prefer a LAN or emulator host over loopback when several candidates exist. */
export function preferredDevServerHost(
  candidates: Array<string | null | undefined>,
): string | null {
  let loopback: string | null = null;
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    const host = hostnameFromDevServer(trimmed);
    if (!trimmed || !host) continue;
    if (!isLoopbackHost(host)) return trimmed;
    loopback ??= trimmed;
  }
  return loopback;
}

/** Accepts a full URL or Expo's `host:port` debugger host. */
export function hostnameFromDevServer(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return null;
    }
  }
  const host = trimmed.split(":")[0]?.trim();
  return host || null;
}

/**
 * Host the device can use to reach a server bound on the development machine.
 * Expo Go reports Metro as `192.168.x.x:8081` on a phone. The Android emulator
 * reaches the host through 10.0.2.2 when that host is loopback.
 */
export function deviceApiHost(input: {
  platform: string;
  devServerHost?: string | null;
}): string | null {
  const devHost = hostnameFromDevServer(input.devServerHost);
  if (devHost && !isLoopbackHost(devHost)) {
    return devHost;
  }
  if (input.platform === "android") {
    return ANDROID_EMULATOR_HOST;
  }
  return null;
}

/** Rewrite a loopback API URL so a device or emulator can reach the host. */
export function apiBaseUrlForDevice(configured: string, deviceHost: string | null): string {
  const trimmed = configured.trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (!isLoopbackHost(url.hostname) || !deviceHost || isLoopbackHost(deviceHost)) {
    return trimmed;
  }
  url.hostname = deviceHost;
  return url.toString().replace(/\/$/, "");
}
