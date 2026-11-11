import { useSyncExternalStore } from "react";

/**
 * One in-app banner at a time over Today (frames 29, 29b, 113). The shell
 * mounts `ForegroundBanner` (meal, coach note); Today owns the check-in
 * reviewed banner. This tiny store lets Today stay quiet while a meal or note
 * banner is up, so two floating banners never stack on top of each other.
 */
let active = false;
const listeners = new Set<() => void>();

export function setForegroundBannerActive(next: boolean): void {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useForegroundBannerActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );
}
