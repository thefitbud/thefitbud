import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CheckinFormTemplateDetail } from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { LoadingBlock } from "../../components/StatePanels";

export function CheckinTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const [detail, setDetail] = useState<CheckinFormTemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    void apiClient
      .getCheckinFormTemplate(templateId)
      .then(setDetail)
      .catch(() => setError("Could not load this check-in form."));
  }, [templateId]);

  if (error) {
    return (
      <section className="page">
        <p className="form-error" role="alert">{error}</p>
        <Link to="/templates/checkins">Back to check-ins</Link>
      </section>
    );
  }

  if (!detail) return <LoadingBlock label="Loading form…" />;

  const latest =
    detail.versions.find((v) => v.id === detail.latestVersionId) ??
    detail.versions[detail.versions.length - 1];

  return (
    <section className="page template-builder-page">
      <header className="page-header">
        <Link to="/templates/checkins">← Check-in templates</Link>
        <h1>{detail.name}</h1>
        <p className="muted">
          Version {latest?.version ?? detail.latestVersionNumber} ·{" "}
          {detail.ownership === "global" ? "FitBud base" : "Your copy"}
        </p>
      </header>
      <div className="overview-card">
        <h2>Questions</h2>
        <ul className="builder-field-list">
          {(latest?.fields ?? []).map((field) => (
            <li key={field.id}>
              <strong>{field.label}</strong>
              <span className="muted"> · {field.type}</span>
            </li>
          ))}
        </ul>
        <p className="muted">
          Publish a new version from the full editor when you change fields.
        </p>
      </div>
    </section>
  );
}
