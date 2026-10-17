import { Navigate, NavLink, Route, Routes, useParams } from "react-router-dom";
import { TemplatesPage } from "./TemplatesPage";
import { LibrariesPanel } from "./templates/LibrariesPanel";
import type { TemplateFamily } from "./templates/shared";

const TABS = [
  { slug: "workouts", label: "Workouts" },
  { slug: "diets", label: "Diets" },
  { slug: "full-plans", label: "Full plans" },
  { slug: "checkins", label: "Check-ins" },
  { slug: "onboarding", label: "Onboarding" },
  { slug: "libraries", label: "Libraries" },
] as const;

const FAMILY_BY_SLUG: Record<string, TemplateFamily> = {
  workouts: "workout",
  diets: "nutrition",
  "full-plans": "combined",
  onboarding: "onboarding",
};

export function TemplatesHub() {
  return (
    <Routes>
      <Route index element={<Navigate to="workouts" replace />} />
      <Route
        path=":type/*"
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
                  end={tab.slug !== "libraries"}
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
    return (
      <section className="page templates-page">
        <p className="lede">
          Manage check-in forms from the global Check-ins area or fork a FitBud
          base below.
        </p>
        <TemplatesPage initialFamily="onboarding" />
      </section>
    );
  }
  const family = FAMILY_BY_SLUG[type] ?? "workout";
  return <TemplatesPage key={family} initialFamily={family} />;
}
