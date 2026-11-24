/**
 * Chrome and structured credits for the public legal pages (BT3, Z14-27).
 *
 * The text of each document is published markdown (`docs/legal/published/*.md`,
 * bundled by `documents.ts`), copied from the drafts prepared for counsel in
 * PR #177. Counsel has not approved it: every page keeps the "pending counsel
 * review, not yet in force" banner until Firoz records sign-off
 * (`LEGAL_COUNSEL_SIGNOFF` in packages/core/src/legal-config.ts).
 *
 * The credits page keeps the factual exercise and food credits as structured
 * tables (docs/spec/credits-and-licences.md) and adds the remaining notices
 * from draft 08.
 */
import {
  LEGAL_DOC_LIST,
  legalDocByPath,
  type LegalDocMeta,
  type LegalPath,
} from "../../../../../docs/legal/published/registry";

export { LEGAL_DOC_LIST, legalDocByPath };
export type { LegalDocMeta, LegalPath };

export const SUPPORT_EMAIL = "tech@thefitbud.com";

export const CC_BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";
export const CC_BY_SA_3 = "https://creativecommons.org/licenses/by-sa/3.0/";

/** Side navigation and Help links: every public document. */
export const LEGAL_NAV: { path: LegalPath; label: string }[] = LEGAL_DOC_LIST.map((doc) => ({
  path: doc.path,
  label: doc.title,
}));

export const LEGAL_CHROME = {
  brand: "FitBud",
  backToSignIn: "Back to sign in",
  navLabel: "Legal",
  questionsPrefix: "Questions?",
  effective: "Effective",
  lastUpdated: "Last updated",
} as const;

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
};

export const credits: CreditsDocument = {
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
};


/**
 * Short labels for the sign-in footer. Three links: the footer's spacing and 44px targets are
 * pinned at 375, 1024 and 1440px by e2e/bt3f-signin-footer.spec.ts. Every other document is one
 * click away in the Legal nav on each legal page.
 */
export const LEGAL_FOOTER_LINKS: { path: LegalPath; label: string }[] = [
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/credits", label: "Credits and licences" },
];

export const LEGAL_FOOTER_LABEL = "Legal";
