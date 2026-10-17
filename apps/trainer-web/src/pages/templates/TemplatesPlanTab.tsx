import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import type { PlanTemplate, PlanTemplateType } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { listPlanTemplatesExtended } from "../../lib/http-api";
import { pageClientDirectory } from "../../lib/clients";
import { PlanTemplateFamily, summaryOf } from "./PlanTemplateFamily";
import { errorText, templateTypeLabel, withRelationship, type ApplyClient } from "./shared";
import { useCursorPage, useDebounced } from "./useCursorPage";
import {
  filterByScope,
  readTemplateScope,
  TemplateScopeToolbar,
} from "./TemplateScopeToolbar";

export function TemplatesPlanTab({
  templateType,
  hubSlug,
}: {
  templateType: PlanTemplateType;
  hubSlug: string;
}) {
  const [params] = useSearchParams();
  const scope = readTemplateScope(params);
  const debouncedQ = useDebounced(params.get("q") ?? "", 300);
  const plans = useCursorPage(
    `plan-templates-${templateType}-${scope}-${debouncedQ}`,
    (cursor) =>
      listPlanTemplatesExtended({
        cursor,
        limit: 50,
        templateType,
        scope,
        q: debouncedQ || undefined,
      }),
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

  const visible = filterByScope(
    plans.items.filter((item) => item.templateType === templateType),
    scope,
  );

  function rememberTemplate(template: PlanTemplate) {
    const summary = summaryOf(template);
    plans.setItems((current) => [
      summary,
      ...current.filter((item) => item.id !== summary.id),
    ]);
  }

  const label = templateTypeLabel(templateType);

  return (
    <section className="page templates-page">
      <header className="page-header templates-hero">
        <div>
          <h1>{label} templates</h1>
          <p className="lede">
            Fork FitBud bases or build your own. Use opens the full-screen editor.
          </p>
        </div>
      </header>
      <TemplateScopeToolbar />
      {plans.error ? (
        <p className="form-error" role="alert">
          {plans.error}{" "}
          <button type="button" className="button-link" onClick={plans.reload}>
            Retry
          </button>
        </p>
      ) : null}
      <ul className="template-list compact">
        {visible.map((item) => (
          <li key={item.id} className="template-row">
            <div>
              <p className="template-title">{item.title}</p>
              <p className="muted">
                {item.ownership === "global" ? "FitBud base" : "Mine"}
              </p>
            </div>
            <Link
              className="button-secondary"
              to={`/templates/${hubSlug}/${item.id}`}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
      <PlanTemplateFamily
        templateType={templateType}
        templates={visible}
        nextCursor={plans.nextCursor}
        loading={plans.loading}
        loadingMore={plans.loadingMore}
        onLoadMore={plans.loadMore}
        onSaved={rememberTemplate}
        clients={clients}
        clientError={clientError}
      />
    </section>
  );
}
