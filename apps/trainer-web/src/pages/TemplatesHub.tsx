import { Navigate, NavLink, Route, Routes, useParams } from "react-router-dom";
import { TemplatesPlanTab } from "./templates/TemplatesPlanTab";
import { LibrariesPanel } from "./templates/LibrariesPanel";
import { CheckinTemplatesPanel } from "./templates/CheckinTemplatesPanel";
import { OnboardingTemplates } from "./templates/OnboardingTemplates";
import { OnboardingTemplateBuilderPage } from "./templates/OnboardingTemplateBuilderPage";
import { CheckinTemplateBuilderPage } from "./templates/CheckinTemplateBuilderPage";
import { PlanTemplateEditorPage } from "./templates/PlanTemplateEditorPage";
import { TemplateScopeToolbar } from "./templates/TemplateScopeToolbar";

const TABS = [
  { slug: "workouts", label: "Workouts" },
  { slug: "diets", label: "Diets" },
  { slug: "full-plans", label: "Full plans" },
  { slug: "checkins", label: "Check-ins" },
  { slug: "onboarding", label: "Onboarding" },
  { slug: "libraries", label: "Libraries" },
] as const;

export function TemplatesHub() {
  return (
    <Routes>
      <Route index element={<Navigate to="workouts" replace />} />
      <Route path="onboarding/:templateId" element={<OnboardingTemplateBuilderPage />} />
      <Route path="checkins/:templateId" element={<CheckinTemplateBuilderPage />} />
      <Route path="workouts/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="diets/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="full-plans/:templateId" element={<PlanTemplateEditorPage />} />
      <Route
        path=":type"
        element={
          <>
            <nav className="templates-hub-tabs" aria-label="Template types">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.slug}
                  to={`/templates/${tab.slug}`}
                  className={({ isActive }) =>
                    isActive ? "hub-tab is-active" : "hub-tab"
                  }
                  end
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
            <TemplatesTabContent />
          </>
        }
      />
    </Routes>
  );
}

function TemplatesTabContent() {
  const { type = "workouts" } = useParams();
  if (type === "libraries") {
    return <LibrariesPanel />;
  }
  if (type === "checkins") {
    return <CheckinTemplatesPanel />;
  }
  if (type === "onboarding") {
    return (
      <section className="page templates-page">
        <header className="page-header">
          <h1>Onboarding forms</h1>
          <p className="lede">Intake forms for new clients.</p>
        </header>
        <TemplateScopeToolbar />
        <OnboardingTemplates />
      </section>
    );
  }
  const family =
    type === "diets"
      ? "nutrition"
      : type === "full-plans"
        ? "combined"
        : "workout";
  return <TemplatesPlanTab key={family} templateType={family} hubSlug={type} />;
}
