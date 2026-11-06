/**
 * Links from the app to the public legal pages on the trainer web app
 * (`/privacy`, `/terms`, `/credits`, built by BT3).
 *
 * This module owns the trainer-web base URL for the whole app. `trainer/MoreScreen.tsx`
 * re-exports `DEFAULT_TRAINER_WEB_URL` and `trainerWebUrl` from here so its existing
 * importers keep working unchanged.
 */

/** Trainer web (D-W2-7). Staging builds set EXPO_PUBLIC_TRAINER_WEB_URL in eas.json. */
export const DEFAULT_TRAINER_WEB_URL = "https://app.thefitbud.com";

/**
 * Keep the literal `process.env.EXPO_PUBLIC_TRAINER_WEB_URL` member expression:
 * Expo's Babel transform only inlines that exact form into the bundle. A destructured
 * or computed read silently becomes `undefined` in a real build.
 */
export function trainerWebUrl(): string {
  return process.env.EXPO_PUBLIC_TRAINER_WEB_URL?.trim() || DEFAULT_TRAINER_WEB_URL;
}

/** The three public legal pages, in the order the Legal group lists them. */
export type LegalPath = "/privacy" | "/terms" | "/credits";

/** Absolute URL of a legal page, e.g. `https://app.thefitbud.com/privacy`. */
export function legalUrl(path: LegalPath): string {
  return `${trainerWebUrl().replace(/\/+$/, "")}${path}`;
}

/**
 * The host-and-path hint under a legal row, e.g. `app.thefitbud.com/privacy`.
 * The scheme is dropped so the row reads as an address, as in ds5-ios-more-legal.png.
 */
export function legalUrlHint(path: LegalPath): string {
  return legalUrl(path).replace(/^https?:\/\//, "");
}
