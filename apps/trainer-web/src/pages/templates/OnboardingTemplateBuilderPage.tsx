import { Link, useParams } from "react-router-dom";
import { OnboardingTemplates } from "./OnboardingTemplates";

/** Dedicated route wrapper (TW-24). Opens the onboarding builder with hub chrome hidden. */
export function OnboardingTemplateBuilderPage() {
  const { templateId } = useParams();
  return (
    <section className="page templates-page">
      <Link to="/templates/onboarding">← Onboarding templates</Link>
      <OnboardingTemplates initialTemplateId={templateId ?? undefined} />
    </section>
  );
}
