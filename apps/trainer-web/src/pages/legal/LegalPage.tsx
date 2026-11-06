import { ArrowLeft, Copyright, FileText, Shield, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandMark } from "../../components/BrandMark";
import "./legal.css";
import {
  LEGAL_CHROME,
  LEGAL_DOCUMENTS,
  LEGAL_NAV,
  SUPPORT_EMAIL,
  type CreditCard,
  type CreditsDocument,
  type DraftDocument,
  type LegalPath,
} from "./content";

const NAV_ICONS = {
  "/privacy": Shield,
  "/terms": FileText,
  "/credits": Copyright,
} as const;

function DraftBody({ doc }: { doc: DraftDocument }) {
  return (
    <>
      <p className="legal-updated">{doc.updated}</p>
      <div className="legal-draft-banner" role="note" data-testid="legal-draft-notice">
        <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>{doc.notice}</span>
      </div>
      {doc.fact ? (
        <p className="legal-fact" data-testid="legal-account-deletion">
          <b>{doc.fact.lead}</b> {doc.fact.before}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> {doc.fact.after}
        </p>
      ) : null}
      {doc.sections.map((section) => (
        <section key={section.heading} className="legal-section">
          <h2>{section.heading}</h2>
          <p className="legal-draft-note">{doc.sectionNote}</p>
          <div aria-hidden="true">
            {section.bars.map((width, i) => (
              <i key={i} className="legal-bar" style={{ width: `${width}%` }} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
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
  return (
    <>
      <p className="legal-updated">{doc.intro}</p>
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
      </section>
      <section className="legal-section">
        <h2>{doc.text.heading}</h2>
        <Cards cards={doc.text.cards} />
      </section>
    </>
  );
}

export function LegalPage({ path }: { path: LegalPath }) {
  const doc = LEGAL_DOCUMENTS[path];
  return (
    <div className="legal-page" data-testid={`legal-${path.slice(1)}`}>
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
          {doc.kind === "draft" ? <DraftBody doc={doc} /> : <CreditsBody doc={doc} />}
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
export function CreditsPage() {
  return <LegalPage path="/credits" />;
}
