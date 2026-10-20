import { useEffect } from "react";
import * as Linking from "expo-linking";
import { parseDeepLinkUrl, type ParsedDeepLink } from "./linking";

/**
 * Register fitbud:// and https /go/ cold-start + runtime URLs (TR-23).
 * Parsed links are handed to the app via onLink; invite URLs are ignored here
 * (AcceptInviteScreen owns those).
 */
export function useAppDeepLinks(onLink: (link: ParsedDeepLink) => void): void {
  useEffect(() => {
    let cancelled = false;

    function handle(url: string | null) {
      if (!url || cancelled) return;
      // Invite accept flow keeps its own listener.
      if (/\/i\/|invite/i.test(url) && !/\/go\//i.test(url)) return;
      const parsed = parseDeepLinkUrl(url);
      if (parsed) onLink(parsed);
    }

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (event) => {
      handle(event.url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [onLink]);
}
