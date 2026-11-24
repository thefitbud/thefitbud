import {
  ArrowLeft,
  Ban,
  Copyright,
  FileText,
  FlaskConical,
  HeartPulse,
  Shield,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LEGAL_BANNER,
  LEGAL_COUNSEL_SIGNOFF,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  fillLegalTokens,
  isLegalInForce,
} from "@fitbud/core";
import { LEGAL_MARKDOWN } from "../../../../../docs/legal/published/documents";
import { parseLegalMarkdown, type Block } from "../../../../../docs/legal/published/markdown";
import { BrandMark } from "../../components/BrandMark";
import "./legal.css";
import {
  LEGAL_CHROME,
  LEGAL_NAV,
  SUPPORT_EMAIL,
  credits,
  legalDocByPath,
  type CreditCard,
  type CreditsDocument,
  type LegalPath,
} from "./content";
import { LegalBlock, LegalMarkdown } from "./LegalMarkdown";

const NAV_ICONS: Record<LegalPath, LucideIcon> = {
  "/privacy": Shield,
  "/terms": FileText,
  "/terms/trainer": FileText,
  "/terms/trainee": FileText,
  "/health": HeartPulse,
  "/acceptable-use": Ban,
  "/beta": FlaskConical,
  "/credits": Copyright,
};

/** The published text for a document, with the config values filled in. */
function blocksFor(path: LegalPath): Block[] {
  const doc = legalDocByPath(path);
  if (!doc) return [];
  return parseLegalMarkdown(fillLegalTokens(LEGAL_MARKDOWN[doc.slug]));
}

function Banner() {
  if (isLegalInForce(LEGAL_COUNSEL_SIGNOFF)) return null;
  return (
    <div className="legal-draft-banner" role="note" data-testid="legal-draft-notice">
      <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
      <span>
        <b>{LEGAL_BANNER.title}.</b> {LEGAL_BANNER.text}
      </span>
    </div>
  );
}

function Dates() {
  return (
    <p className="legal-updated" data-testid="legal-dates">
      {LEGAL_CHROME.effective} {LEGAL_EFFECTIVE_DATE} · {LEGAL_CHROME.lastUpdated}{" "}
      {LEGAL_LAST_UPDATED}
    </p>
  );
}

function DocumentBody({ path }: { path: LegalPath }) {
  const blocks = useMemo(() => blocksFor(path), [path]);
  return <LegalMarkdown blocks={blocks} />;
}

function Cards({ cards }: { cards: CreditCard[] }) {
  return (
    <ul className="legal-cards">
      {cards.map((card) => (
        <li key={card.name} className="legal-card">
          <h3>{card.name}</h3>
          <span className="legal-card-line">{card.line}</span>
          <span>{card.licence}</span>
        </li>
      ))}
    </ul>
  );
}

function CreditsBody({ doc }: { doc: CreditsDocument }) {
  const { drawings } = doc;
  // The rest of draft 08 (descriptions, estimates note, fonts and icons, questions).
  const blocks = useMemo(() => blocksFor("/credits"), []);
  const sections = useMemo(() => splitSections(blocks), [blocks]);
  const pick = (title: string) => sections.find((s) => s.title === title)?.blocks ?? [];
  const nutritionNote = pick("Food and nutrition data").filter(
    (b) =>
      b.type === "paragraph" &&
      b.inline[0]?.type === "text" &&
      b.inline[0].value.startsWith("Nutrition figures"),
  );
  return (
    <>
      <p className="legal-lead">{doc.intro}</p>
      <section className="legal-section">
        <h2>{drawings.heading}</h2>
        <p className="legal-lead">{drawings.summary}</p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">{drawings.columns.author}</th>
                <th scope="col">{drawings.columns.drawings}</th>
                <th scope="col">{drawings.columns.licence}</th>
                <th scope="col">{drawings.columns.from}</th>
              </tr>
            </thead>
            <tbody>
              {drawings.rows.map((row) => (
                <tr key={row.author}>
                  <th scope="row">{row.author}</th>
                  <td>{row.drawings}</td>
                  <td>
                    {row.licences.map((licence, i) => (
                      <span key={licence.url}>
                        {i > 0 ? " / " : null}
                        <a href={licence.url} target="_blank" rel="noopener noreferrer">
                          {licence.label}
                        </a>
                      </span>
                    ))}
                  </td>
                  <td>{row.from}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="legal-footnote">{drawings.footnote}</p>
      </section>
      <section className="legal-section">
        <h2>{doc.food.heading}</h2>
        <Cards cards={doc.food.cards} />
        {nutritionNote.map((block, i) => (
          <div key={i} className="legal-md">
            <LegalBlock block={block} />
          </div>
        ))}
      </section>
      {["Exercise descriptions", "Fonts, icons and software", "Questions"].map((title) => (
        <section key={title} className="legal-section legal-md">
          {pick(title).map((block, i) => (
            <LegalBlock key={i} block={block} />
          ))}
        </section>
      ))}
    </>
  );
}

/** Split the credits markdown into its `##` sections (heading kept as the first block). */
function splitSections(blocks: Block[]): { title: string; blocks: Block[] }[] {
  const out: { title: string; blocks: Block[] }[] = [];
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      out.push({ title: block.text, blocks: [block] });
    } else {
      out[out.length - 1]?.blocks.push(block);
    }
  }
  return out;
}

export function LegalPage({ path }: { path: LegalPath }) {
  const doc = legalDocByPath(path);
  const { hash } = useLocation();
  // A link such as /privacy#delete-account scrolls to its heading once the text is on screen.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash, path]);
  if (!doc) return null;
  return (
    <div className="legal-page" data-testid={`legal-${doc.slug}`}>
      <header className="legal-top">
        <span className="legal-brand">
          <BrandMark size={28} />
          {LEGAL_CHROME.brand}
        </span>
        <Link className="legal-back" to="/sign-in">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          {LEGAL_CHROME.backToSignIn}
        </Link>
      </header>
      <div className="legal-layout">
        <nav className="legal-nav" aria-label={LEGAL_CHROME.navLabel}>
          <p className="legal-nav-kicker" aria-hidden="true">
            {LEGAL_CHROME.navLabel}
          </p>
          {LEGAL_NAV.map((item) => {
            const Icon = NAV_ICONS[item.path];
            const current = item.path === path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={current ? "legal-nav-link is-current" : "legal-nav-link"}
                aria-current={current ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <p className="legal-help">
            {LEGAL_CHROME.questionsPrefix}{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </nav>
        <main className="legal-doc">
          <h1>{doc.title}</h1>
          <Dates />
          <Banner />
          {path === "/credits" ? <CreditsBody doc={credits} /> : <DocumentBody path={path} />}
        </main>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage path="/privacy" />;
}
export function TermsPage() {
  return <LegalPage path="/terms" />;
}
export function TrainerTermsPage() {
  return <LegalPage path="/terms/trainer" />;
}
export function TraineeTermsPage() {
  return <LegalPage path="/terms/trainee" />;
}
export function HealthPage() {
  return <LegalPage path="/health" />;
}
export function AcceptableUsePage() {
  return <LegalPage path="/acceptable-use" />;
}
export function BetaTermsPage() {
  return <LegalPage path="/beta" />;
}
export function CreditsPage() {
  return <LegalPage path="/credits" />;
}
