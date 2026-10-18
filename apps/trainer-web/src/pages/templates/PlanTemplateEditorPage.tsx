import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanContent, PlanTemplate, PlanTemplateType } from "@fitbud/contracts";
import { PlanBuilder } from "../../components/builder/PlanBuilder";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import "../../styles/plan.css";
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

function TemplateBuilder({
  templateId,
  hubSlug,
  templateType,
}: {
  templateId: string;
  hubSlug: string;
  templateType: PlanTemplateType;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const [template, setTemplate] = useState<PlanTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);
  const recordVersion = useRef(0);
  const hubPath = `/templates/${hubSlug}`;
  const screenId = templateType === "nutrition" ? "screen-TW-14" : "screen-TW-13";

  const load = useCallback(() => {
    setError(null);
    setTemplate(null);
    apiClient
      .getPlanTemplate(templateId)
      .then((loaded) => {
        recordVersion.current = loaded.recordVersion;
        setTemplate(loaded);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiClientError ? err.message : "Couldn't load this template."),
      );
  }, [templateId]);

  useEffect(() => load(), [load]);

  const save = useCallback(
    async (title: string, content: PlanContent) => {
      const updated = await apiClient.updatePlanTemplate(templateId, {
        expectedRecordVersion: recordVersion.current,
        title,
        content,
      });
      recordVersion.current = updated.recordVersion;
    },
    [templateId],
  );

  async function fork() {
    if (!template) return;
    setForking(true);
    setForkError(null);
    try {
      const copy = await apiClient.forkPlanTemplate(
        template.id,
        { title: `${template.title} (copy)` },
        createIdempotencyKey(),
      );
      navigate(`${hubPath}/${copy.id}`);
    } catch (err) {
      setForkError(err instanceof ApiClientError ? err.message : "Couldn't make a copy.");
    } finally {
      setForking(false);
    }
  }

  if (error) {
    return (
      <section className="page plan-builder-page" data-testid={screenId}>
        <ErrorState message={error} onRetry={load} screenId={screenId.replace("screen-", "")} />
      </section>
    );
  }
  if (!template) {
    return (
      <section className="page plan-builder-page" data-testid={screenId}>
        <LoadingBlock label="Loading the template…" />
      </section>
    );
  }
  const isGlobal = template.ownership === "global";
  return (
    <PlanBuilder
      key={template.id}
      backTo={hubPath}
      backLabel={`${hubSlug} templates`}
      initialTitle={template.title}
      initialContent={template.content}
      statusLabel={isGlobal ? "FitBud template" : "Template"}
      tab={templateType === "nutrition" ? "nutrition" : "workout"}
      save={save}
      readOnly={isGlobal}
      readOnlyNote={
        isGlobal ? (
          <>
            This is a FitBud template, so it can&apos;t be edited. Make a copy to change it.{" "}
            <button type="button" className="button-link" disabled={forking || !online} onClick={() => void fork()}>
              {forking ? "Copying…" : "Make a copy"}
            </button>
            {forkError ? <span className="field-error"> {forkError}</span> : null}
          </>
        ) : undefined
      }
      online={online}
      onPublish={() => navigate(hubPath)}
      publishLabel="Save"
      screenId={screenId}
    />
  );
}

export function PlanTemplateEditorPage() {
  const { templateId = "" } = useParams();
  const { pathname } = useLocation();
  const hubSlug = hubSlugFromPath(pathname);
  const templateType = TYPE_BY_SLUG[hubSlug] ?? "workout";
  const [template, setTemplate] = useState<PlanTemplate | null>(null);
  const [clients, setClients] = useState<ApplyClient[]>([]);

  useEffect(() => {
    if (!templateId || templateType !== "combined") return;
    void apiClient.getPlanTemplate(templateId).then(setTemplate).catch(() => setTemplate(null));
    void pageClientDirectory((q) => apiClient.listClients(q)).then((items) =>
      setClients(withRelationship(items)),
    );
  }, [templateId, templateType]);

  if (!templateId) {
    return <p className="form-error">Missing template id.</p>;
  }

  if (templateType !== "combined") {
    return <TemplateBuilder templateId={templateId} hubSlug={hubSlug} templateType={templateType} />;
  }

  const summaries = template ? [summaryOf(template)] : [];

  return (
    <section
      className="page templates-page plan-template-editor"
      data-testid="screen-TW-27"
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
