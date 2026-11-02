/**
 * Text for the public legal pages (BT3). LegalPage.tsx holds no copy of its own.
 *
 * DRAFT STATUS (owner decision, Firoz, 2 Nov 2026): counsel's text for the
 * Privacy policy and Terms of use is still being prepared, so those two pages
 * ship as clearly marked drafts. To publish counsel's text, replace the
 * `sections` of `privacy` and `terms`, set `updated`, and change the `notice`;
 * the page structure does not change. The Credits page is real content from
 * docs/spec/credits-and-licences.md and apps/api/seed/library/ATTRIBUTION.md.
 */

export const SUPPORT_EMAIL = "tech@thefitbud.com";

export const CC_BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";
export const CC_BY_SA_3 = "https://creativecommons.org/licenses/by-sa/3.0/";

export type LegalPath = "/privacy" | "/terms" | "/credits";

export const LEGAL_NAV: { path: LegalPath; label: string }[] = [
  { path: "/privacy", label: "Privacy policy" },
  { path: "/terms", label: "Terms of use" },
  { path: "/credits", label: "Credits and licences" },
];

export const LEGAL_CHROME = {
  brand: "FitBud",
  backToSignIn: "Back to sign in",
  navLabel: "Legal",
  questionsPrefix: "Questions?",
} as const;

export type DraftSection = {
  heading: string;
  /** Widths (percent) of the grey bars that stand in for the missing text. */
  bars: number[];
};

export type DraftDocument = {
  kind: "draft";
  path: "/privacy" | "/terms";
  title: string;
  updated: string;
  /** Stated at the top of the page so it cannot be mistaken for the real text. */
  notice: string;
  /** Shown under every heading whose text is not written yet. */
  sectionNote: string;
  /** A real, already-decided fact shown above the draft sections. */
  fact?: { lead: string; before: string; after: string };
  sections: DraftSection[];
};

const DRAFT_NOTICE =
  "Draft only. Counsel is still preparing the final text, so this page is not yet in force and is not the policy or terms that apply to you. Do not rely on it. The sections below are headings only.";
const SECTION_NOTE = "Draft. Counsel's text is not written yet.";

export const privacy: DraftDocument = {
  kind: "draft",
  path: "/privacy",
  title: "Privacy policy",
  updated: "Last updated: not yet published",
  notice: DRAFT_NOTICE,
  sectionNote: SECTION_NOTE,
  fact: {
    lead: "Deleting your account during the beta.",
    before: "Email",
    after:
      "from the email or number on your account and ask us to delete it. There is no in-app delete button yet.",
  },
  sections: [
    { heading: "1. Who we are", bars: [100, 96, 88] },
    { heading: "2. What we collect", bars: [100, 96, 88, 72] },
    { heading: "3. What your coach can see", bars: [100, 96, 88] },
    { heading: "4. How we use your data", bars: [100, 96, 88, 72] },
    { heading: "5. Who we share it with", bars: [100, 96, 88] },
    { heading: "6. Deleting your account", bars: [100, 96] },
    { heading: "7. Contact", bars: [100, 96] },
  ],
};

export const terms: DraftDocument = {
  kind: "draft",
  path: "/terms",
  title: "Terms of use",
  updated: "Last updated: not yet published",
  notice: DRAFT_NOTICE,
  sectionNote: SECTION_NOTE,
  sections: [
    { heading: "1. Using FitBud", bars: [100, 96, 88, 72] },
    { heading: "2. Accounts", bars: [100, 96, 88] },
    { heading: "3. Coaches and clients", bars: [100, 96, 88, 72] },
    { heading: "4. Health information", bars: [100, 96, 88] },
    { heading: "5. Payments", bars: [100, 96] },
    { heading: "6. Ending your account", bars: [100, 96, 88] },
    { heading: "7. Liability", bars: [100, 96, 88] },
    { heading: "8. Changes to these terms", bars: [100, 96] },
  ],
};

export type CreditRow = {
  author: string;
  drawings: number;
  licences: { label: string; url: string }[];
  from: string;
};

export type CreditCard = {
  name: string;
  line: string;
  licence: string;
};

export type CreditsDocument = {
  kind: "credits";
  path: "/credits";
  title: string;
  intro: string;
  drawings: {
    heading: string;
    summary: string;
    columns: { author: string; drawings: string; licence: string; from: string };
    rows: CreditRow[];
    footnote: string;
  };
  food: { heading: string; cards: CreditCard[] };
  text: { heading: string; cards: CreditCard[] };
};

export const credits: CreditsDocument = {
  kind: "credits",
  path: "/credits",
  title: "Credits and licences",
  intro:
    "The sources behind the exercise and food library, and the licence each one is used under.",
  drawings: {
    heading: "Exercise drawings",
    summary:
      "919 drawings for 460 exercises, all under Creative Commons BY-SA. Edited versions of a drawing are shared under the same licence, with the same credit.",
    columns: {
      author: "Author",
      drawings: "Drawings",
      licence: "Licence",
      from: "Where from",
    },
    rows: [
      {
        author: "Everkinetic (everkinetic.com)",
        drawings: 912,
        licences: [
          { label: "CC BY-SA 4.0", url: CC_BY_SA_4 },
          { label: "CC BY-SA 3.0", url: CC_BY_SA_3 },
        ],
        from: "Everkinetic, Wikimedia Commons, wger",
      },
      {
        author: "CFCF",
        drawings: 4,
        licences: [{ label: "CC BY-SA 4.0", url: CC_BY_SA_4 }],
        from: "Wikimedia Commons",
      },
      {
        author: "wger.de",
        drawings: 2,
        licences: [{ label: "CC BY-SA 3.0", url: CC_BY_SA_3 }],
        from: "wger",
      },
      {
        author: "hans",
        drawings: 1,
        licences: [{ label: "CC BY-SA 4.0", url: CC_BY_SA_4 }],
        from: "wger",
      },
    ],
    footnote:
      "Of the Everkinetic drawings, 574 are CC BY-SA 4.0 and 338 are CC BY-SA 3.0, as recorded with each file.",
  },
  food: {
    heading: "Food data",
    cards: [
      {
        name: "Indian Nutrient Databank (INDB)",
        line: "Nutrient data: Indian Nutrient Databank (INDB), Vijayakumar et al. 2024, CC BY 4.0.",
        licence: "CC BY 4.0",
      },
      {
        name: "USDA FoodData Central",
        line: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.",
        licence: "Public domain / CC0 1.0",
      },
    ],
  },
  text: {
    heading: "Exercise text",
    cards: [
      {
        name: "free-exercise-db (yuhonas)",
        line: "Exercise names, steps, muscles, equipment",
        licence: "The Unlicense (public domain)",
      },
    ],
  },
};

export type LegalDocument = DraftDocument | CreditsDocument;

export const LEGAL_DOCUMENTS: Record<LegalPath, LegalDocument> = {
  "/privacy": privacy,
  "/terms": terms,
  "/credits": credits,
};

/** Short labels for the sign-in footer. */
export const LEGAL_FOOTER_LINKS: { path: LegalPath; label: string }[] = [
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/credits", label: "Credits and licences" },
];

export const LEGAL_FOOTER_LABEL = "Legal";
