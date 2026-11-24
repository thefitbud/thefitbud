import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Z14-18: Android hardware back and back gesture.
 *
 * Every mounted, enabled handler is kept in one list behind a single
 * `hardwareBackPress` listener. The most recently MOUNTED handler runs first
 * (a screen opened on top of another is mounted later, so it answers first),
 * and a handler returning `true` consumes the press. When none consumes it the
 * press falls through to Android's default (leave the app).
 *
 * Mount order comes from a counter taken while rendering, not from effect
 * order: React runs a child's effects before its parent's, which would put the
 * parent on top.
 *
 * No-op on iOS and web.
 */
type Entry = { seq: number; enabled: boolean; handler: () => boolean };

const entries = new Set<Entry>();
let nextSeq = 0;
let subscription: { remove: () => void } | null = null;

function dispatchBack(): boolean {
  const ordered = [...entries]
    .filter((entry) => entry.enabled)
    .sort((a, b) => b.seq - a.seq);
  for (const entry of ordered) {
    if (entry.handler()) return true;
  }
  return false;
}

function register(entry: Entry) {
  entries.add(entry);
  if (!subscription) {
    subscription = BackHandler.addEventListener("hardwareBackPress", dispatchBack);
  }
  return () => {
    entries.delete(entry);
    if (entries.size === 0 && subscription) {
      subscription.remove();
      subscription = null;
    }
  };
}

/**
 * `handler` returns `true` when it handled the press. A handler that returns
 * nothing is treated as having handled it, so `useHardwareBack(onBack)` works
 * with a plain `() => void` on-screen back function; return `false` to let the
 * press fall through to the next handler.
 */
export function useHardwareBack(
  handler: () => boolean | void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const entryRef = useRef<Entry | null>(null);
  if (entryRef.current === null) {
    entryRef.current = {
      seq: nextSeq++,
      enabled,
      handler: () => handlerRef.current() !== false,
    };
  }
  entryRef.current.enabled = enabled;
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    return register(entryRef.current as Entry);
  }, []);
}
