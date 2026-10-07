import { useEffect, useState } from "react";
import type { PlanTemplate, PlanTemplateType } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { pageClientDirectory } from "../lib/clients";
import { LibrariesPanel } from "./templates/LibrariesPanel";
import { OnboardingTemplates } from "./templates/OnboardingTemplates";
import { PlanTemplateFamily, summaryOf } from "./templates/PlanTemplateFamily";
import {
  errorText,
  templateTypeLabel,
  withRelationship,
  type ApplyClient,
  type TemplateFamily,
} from "./templates/shared";
import { useCursorPage } from "./templates/useCursorPage";
import "../styles/plan.css";

const FAMILIES: TemplateFamily[] = [
  "onboarding",
  "workout",
  "nutrition",
  "combined",
  "libraries",
];

function familyLabel(family: TemplateFamily): string {
  switch (family) {
    case "onboarding":
      return "Onboarding";
    case "libraries":
      return "Libraries";
    case "workout":
    case "nutrition":
    case "combined":
      return templateTypeLabel(family);
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}

function isPlanFamily(
  family: TemplateFamily,
): family is PlanTemplateType {
  return family === "workout" || family === "nutrition" || family === "combined";
}

export function TemplatesPage() {
  const [family, setFamily] = useState<TemplateFamily>("onboarding");
  const plans = useCursorPage("plan-templates", (cursor) =>
    apiClient.listPlanTemplates({ cursor, limit: 50 }),
  );
  const [clients, setClients] = useState<ApplyClient[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pageClientDirectory((query) => apiClient.listClients(query))
      .then((items) => {
        if (!cancelled) setClients(withRelationship(items));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setClientError(errorText(err, "Could not load clients for apply."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function rememberTemplate(template: PlanTemplate) {
    const summary = summaryOf(template);
    plans.setItems((current) => [
      summary,
      ...current.filter((item) => item.id !== summary.id),
    ]);
  }

  return (
    <section className="page templates-page">
      <header className="page-header templates-hero">
        <div>
          <h1>Templates & Libraries</h1>
          <p className="lede">
            Onboarding forms, workout and nutrition templates, and the exercise
            and food libraries. Applying a template copies a snapshot into a
            client draft.
          </p>
        </div>
      </header>

      <div className="templates-switch" role="group" aria-label="Template family">
        {FAMILIES.map((item) => {
          const count = isPlanFamily(item)
            ? plans.items.filter((template) => template.templateType === item).length
            : null;
          return (
            <button
              key={item}
              type="button"
              className={family === item ? "segment-btn is-on" : "segment-btn"}
              aria-pressed={family === item}
              onClick={() => setFamily(item)}
            >
              {familyLabel(item)}
              {count != null ? (
                <span className="segment-count">
                  {count}
                  {plans.nextCursor ? "+" : ""}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isPlanFamily(family) ? (
        <p className="templates-limit" role="note">
          Template type is not a server filter. Workout, nutrition, and combined
          show only pages already loaded from the template list.
          {plans.nextCursor ? " Load more to include later pages." : ""}
        </p>
      ) : null}

      {isPlanFamily(family) && plans.error ? (
        <p className="form-error" role="alert">
          {plans.error}{" "}
          <button type="button" className="button-link" onClick={plans.reload}>
            Retry
          </button>
        </p>
      ) : null}

      {family === "onboarding" ? <OnboardingTemplates /> : null}
      {isPlanFamily(family) ? (
        <PlanTemplateFamily
          key={family}
          templateType={family}
          templates={plans.items}
          nextCursor={plans.nextCursor}
          loading={plans.loading}
          loadingMore={plans.loadingMore}
          onLoadMore={plans.loadMore}
          onSaved={rememberTemplate}
          clients={clients}
          clientError={clientError}
        />
      ) : null}
      {family === "libraries" ? <LibrariesPanel /> : null}
    </section>
  );
}
