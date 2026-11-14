/**
 * QA-only entry to the primitive gallery (Z12-36 device gate).
 *
 * The device gate builds a Release app against the runner's local seeded API
 * (`scripts/qa/device/build-app.sh`: EXPO_PUBLIC_API_BASE_URL is
 * http://127.0.0.1:8787 on iOS, http://10.0.2.2:8787 on Android). Only such a
 * build (or a dev build with EXPO_PUBLIC_PRIMITIVE_GALLERY=1) loads the
 * gallery; `App.tsx` decides that from the inlined env values, so a store or
 * EAS build, which always points at https://api…thefitbud.com, never contains
 * it. In a QA build, `fitbud://qa/primitives` shows the gallery in place of
 * the app and `fitbud://qa/app` returns to the app. No native change.
 */
import { useEffect, useState } from "react";
import * as Linking from "expo-linking";

/** The URLs a device-gate build is made against (the harness's fixed port 8787). */
export const LOCAL_QA_API_URLS = ["http://127.0.0.1:8787", "http://10.0.2.2:8787"] as const;

export type QaGalleryCommand = "open" | "close";

/** `fitbud://qa/primitives` opens the gallery, `fitbud://qa/app` closes it; anything else is not ours. */
export function qaGalleryCommand(url: string | null | undefined): QaGalleryCommand | null {
  if (!url) return null;
  const match = /^fitbud:\/\/qa\/(primitives|app)\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!match?.[1]) return null;
  return match[1].toLowerCase() === "primitives" ? "open" : "close";
}

/**
 * Whether the gallery is showing. `enabled` is false in every store build,
 * and then this does nothing (no listener). `initiallyOpen` is the dev flag.
 */
export function useQaGalleryLink(enabled: boolean, initiallyOpen = false): boolean {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const handle = (url: string | null) => {
      const command = qaGalleryCommand(url);
      if (!command || cancelled) return;
      setOpen(command === "open");
    };
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => handle(event.url));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);
  return enabled && open;
}
