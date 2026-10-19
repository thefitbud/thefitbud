import { Navigate, NavLink, Route, Routes, useParams } from "react-router-dom";
import { TemplatesPlanTab } from "./templates/TemplatesPlanTab";
import { LibrariesPanel } from "./templates/LibrariesPanel";
import { CheckinTemplatesPanel } from "./templates/CheckinTemplatesPanel";
import { OnboardingTemplates } from "./templates/OnboardingTemplates";
import { OnboardingTemplateBuilderPage } from "./templates/OnboardingTemplateBuilderPage";
import { CheckinTemplateBuilderPage } from "./templates/CheckinTemplateBuilderPage";
import { PlanTemplateEditorPage } from "./templates/PlanTemplateEditorPage";

const TABS = [
  { slug: "workouts", label: "Workouts" },
  { slug: "diets", label: "Diets" },
  { slug: "full-plans", label: "Full plans" },
  { slug: "checkins", label: "Check-ins" },
  { slug: "onboarding", label: "Onboarding" },
  { slug: "libraries", label: "Libraries" },
] as const;

const LEGACY_FAMILY: Record<string, string> = {
  workout: "workouts",
  nutrition: "diets",
  combined: "full-plans",
  onboarding: "onboarding",
  libraries: "libraries",
  checkins: "checkins",
};

export function TemplatesHub() {
  return (
    <Routes>
      <Route index element={<Navigate to="workouts" replace />} />
      <Route path="onboarding/:templateId" element={<OnboardingTemplateBuilderPage />} />
      <Route path="checkins/:templateId" element={<CheckinTemplateBuilderPage />} />
      <Route path="workouts/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="diets/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="full-plans/:templateId" element={<PlanTemplateEditorPage />} />
      <Route path="libraries/:segment" element={<TemplatesHubChrome />} />
      <Route path=":type" element={<TemplatesHubChrome />} />
    </Routes>
  );
}

function TemplatesHubChrome() {
  const { type = "workouts", segment } = useParams();
  const resolvedType = type === "libraries" || segment ? "libraries" : type;
  if (
    resolvedType &&
    LEGACY_FAMILY[resolvedType] &&
    LEGACY_FAMILY[resolvedType] !== resolvedType
  ) {
    return <Navigate to={`/templates/${LEGACY_FAMILY[resolvedType]}`} replace />;
  }

  return (
    <section className="page templates-hub" data-testid="screen-TW-23-hub">
      <header className="page-header">
        <h1>Templates</h1>
        <p className="lede">
          Reusable workouts, diets, forms, and your exercise and food libraries.
        </p>
      </header>
      <nav
        className="templates-hub-tabs"
        aria-label="Template types"
        tabIndex={0}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.slug}
            to={
              tab.slug === "libraries"
                ? "/templates/libraries/exercises"
                : `/templates/${tab.slug}`
            }
            className={({ isActive }) =>
              isActive || (tab.slug === "libraries" && resolvedType === "libraries")
                ? "hub-tab is-active"
                : "hub-tab"
            }
            end={tab.slug !== "libraries"}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <TemplatesTabContent type={resolvedType} />
    </section>
  );
}

function TemplatesTabContent({ type }: { type: string }) {
  if (type === "libraries") {
    return <LibrariesPanel />;
  }
  if (type === "checkins") {
    return <CheckinTemplatesPanel />;
  }
  if (type === "onboarding") {
    return <OnboardingTemplates />;
  }
  const family =
    type === "diets"
      ? "nutrition"
      : type === "full-plans"
        ? "combined"
        : "workout";
  return <TemplatesPlanTab key={family} templateType={family} hubSlug={type} />;
}
