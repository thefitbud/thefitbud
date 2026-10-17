import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

export function PlanTemplateEditorPage() {
  const { type = "workouts", templateId = "" } = useParams();
  const templateType = TYPE_BY_SLUG[type] ?? "workout";
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
    <section className="page templates-page plan-template-editor">
      <Link to={`/templates/${type}`}>← {type.replace("-", " ")} templates</Link>
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
