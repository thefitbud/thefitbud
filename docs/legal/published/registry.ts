/**
 * The public legal documents (Z14-27, D-W14-31): slug, public path and title.
 * Shared by trainer web, the mobile apps and the tests. The text itself is in
 * `<slug>.md` next to this file, bundled into `documents.ts` by
 * `build-documents.mjs`.
 *
 * Counsel has not approved any of this text. Pages keep a "pending counsel
 * review, not yet in force" banner until Firoz records sign-off
 * (`LEGAL_COUNSEL_SIGNOFF` in packages/core/src/legal-config.ts).
 */

export type LegalSlug =
  | "terms"
  | "trainer-terms"
  | "trainee-terms"
  | "privacy"
  | "health"
  | "acceptable-use"
  | "beta"
  | "credits";

export type LegalPath =
  | "/terms"
  | "/terms/trainer"
  | "/terms/trainee"
  | "/privacy"
  | "/health"
  | "/acceptable-use"
  | "/beta"
  | "/credits";

export type LegalDocMeta = {
  slug: LegalSlug;
  path: LegalPath;
  title: string;
  /** Short label for a footer or a list row. */
  label: string;
  /** One line under the title in a list. */
  summary: string;
};

/** In the order a list shows them. */
export const LEGAL_DOC_LIST: readonly LegalDocMeta[] = [
  {
    slug: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    label: "Privacy",
    summary: "What we collect, who sees it, and how to delete your account.",
  },
  {
    slug: "terms",
    path: "/terms",
    title: "Terms of Service",
    label: "Terms",
    summary: "The terms for everyone who uses FitBud.",
  },
  {
    slug: "trainer-terms",
    path: "/terms/trainer",
    title: "Trainer Terms",
    label: "Trainer Terms",
    summary: "Added terms if you use FitBud as a trainer.",
  },
  {
    slug: "trainee-terms",
    path: "/terms/trainee",
    title: "Trainee Terms",
    label: "Trainee Terms",
    summary: "Added terms if you use FitBud as a client.",
  },
  {
    slug: "health",
    path: "/health",
    title: "Health and Fitness notice",
    label: "Health notice",
    summary: "FitBud does not give health or fitness advice.",
  },
  {
    slug: "acceptable-use",
    path: "/acceptable-use",
    title: "Acceptable Use Policy",
    label: "Acceptable use",
    summary: "What is not allowed on FitBud.",
  },
  {
    slug: "beta",
    path: "/beta",
    title: "Beta Terms",
    label: "Beta Terms",
    summary: "Extra terms while FitBud is in closed beta.",
  },
  {
    slug: "credits",
    path: "/credits",
    title: "Credits and licences",
    label: "Credits and licences",
    summary: "The work FitBud is built on, and its licences.",
  },
];

export const LEGAL_PATHS: readonly LegalPath[] = LEGAL_DOC_LIST.map((d) => d.path);

export function legalDocByPath(path: string): LegalDocMeta | undefined {
  return LEGAL_DOC_LIST.find((d) => d.path === path);
}

export function legalDocBySlug(slug: LegalSlug): LegalDocMeta {
  const doc = LEGAL_DOC_LIST.find((d) => d.slug === slug);
  if (!doc) throw new Error("Unknown legal document");
  return doc;
}
