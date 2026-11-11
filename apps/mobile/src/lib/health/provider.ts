/**
 * Web, node tests and any platform without a health store. Metro picks
 * `provider.ios.ts` / `provider.android.ts` on the phones, so the web bundle
 * never loads a native health library.
 */
import { unavailableHealthProvider, type HealthStepsProvider } from "./types";

export async function loadHealthStepsProvider(): Promise<HealthStepsProvider> {
  return unavailableHealthProvider;
}
