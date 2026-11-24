/**
 * Links from the app to the public legal pages on the trainer web app
 * (`/privacy`, `/terms`, `/terms/trainer`, `/terms/trainee`, `/health`,
 * `/acceptable-use`, `/beta`, `/credits`; BT3, Z14-27).
 *
 * The app opens a document in its own `LegalDocumentScreen` (same published
 * text as the web page, no native module). `legalUrl` is the public address,
 * for an "Open in browser" control and for store listings.
 *
 * This module owns the trainer-web base URL for the whole app. `trainer/MoreScreen.tsx`
 * re-exports `DEFAULT_TRAINER_WEB_URL` and `trainerWebUrl` from here so its existing
 * importers keep working unchanged.
 */

import {
  LEGAL_DOC_LIST,
  legalDocByPath,
  type LegalDocMeta,
  type LegalPath,
} from "../../../../docs/legal/published/registry";
import { LEGAL_MARKDOWN } from "../../../../docs/legal/published/documents";
import { parseLegalMarkdown, type Block } from "../../../../docs/legal/published/markdown";
import { fillLegalTokens } from "@fitbud/core";

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

export { LEGAL_DOC_LIST, legalDocByPath };
export type { LegalDocMeta, LegalPath };

/** The three documents a person is pointed to before joining or signing in. */
export const LEGAL_ENTRY_PATHS: readonly LegalPath[] = ["/terms", "/privacy", "/health"];

/**
 * The published text of one document with the config values filled in. A value
 * still "To be confirmed" is marked in the text, never left as a bare gap.
 */
export function legalDocumentBlocks(path: LegalPath): Block[] {
  const doc = legalDocByPath(path);
  if (!doc) return [];
  return parseLegalMarkdown(fillLegalTokens(LEGAL_MARKDOWN[doc.slug]));
}

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
