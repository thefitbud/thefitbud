import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { PlanTemplate, PlanTemplateType } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { PlanTemplateFamily, summaryOf } from "./PlanTemplateFamily";
import { pageClientDirectory } from "../../lib/clients";
import { withRelationship, type ApplyClient } from "./shared";

const TYPE_BY_SLUG: Record<string, PlanTemplateType> = {
  workouts: "workout",
  diets: "nutrition",
  "full-plans": "combined",
};

function hubSlugFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[1];
  return segment ?? "workouts";
}

export function PlanTemplateEditorPage() {
  const { templateId = "" } = useParams();
  const { pathname } = useLocation();
  const hubSlug = hubSlugFromPath(pathname);
  const templateType = TYPE_BY_SLUG[hubSlug] ?? "workout";
  const [template, setTemplate] = useState<PlanTemplate | null>(null);
  const [clients, setClients] = useState<ApplyClient[]>([]);

  useEffect(() => {
    if (!templateId) return;
    void apiClient.getPlanTemplate(templateId).then(setTemplate).catch(() => setTemplate(null));
    void pageClientDirectory((q) => apiClient.listClients(q)).then((items) =>
      setClients(withRelationship(items)),
    );
  }, [templateId]);

  if (!templateId) {
    return <p className="form-error">Missing template id.</p>;
  }

  const summaries = template ? [summaryOf(template)] : [];

  return (
    <section
      className="page templates-page plan-template-editor"
      data-testid={
        templateType === "nutrition"
          ? "screen-TW-14"
          : templateType === "workout"
            ? "screen-TW-13"
            : "screen-TW-27"
      }
    >
      <Link to={`/templates/${hubSlug}`}>
        ← {hubSlug.replace("-", " ")} templates
      </Link>
      <PlanTemplateFamily
        templateType={templateType}
        templates={summaries}
        nextCursor={null}
        loading={!template}
        loadingMore={false}
        onLoadMore={() => undefined}
        onSaved={() => undefined}
        clients={clients}
        clientError={null}
        autoOpenTemplateId={templateId}
      />
    </section>
  );
}
