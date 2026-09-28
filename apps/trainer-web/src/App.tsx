import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { SignInPage } from "./auth/SignInPage";
import { RequireAuth } from "./layout/RequireAuth";
import { AddClientPage } from "./pages/AddClientPage";
import { CheckinReviewPage } from "./pages/CheckinReviewPage";
import { CheckinsPage } from "./pages/CheckinsPage";
import { ClientActivityPage } from "./pages/ClientActivityPage";
import { ClientCheckinsPage } from "./pages/ClientCheckinsPage";
import { ClientHistoryPage } from "./pages/ClientHistoryPage";
import { ClientOverviewPage } from "./pages/ClientOverviewPage";
import { ClientPlanPage } from "./pages/ClientPlanPage";
import { ClientProgressPage } from "./pages/ClientProgressPage";
import { ClientWorkspaceLayout } from "./pages/ClientWorkspaceLayout";
import { ClientsPage } from "./pages/ClientsPage";
import { ConfigureCoachingPage } from "./pages/ConfigureCoachingPage";
import { ExceptionDetailPage } from "./pages/ExceptionDetailPage";
import { HomePage } from "./pages/HomePage";
import { OnboardingReviewPage } from "./pages/OnboardingReviewPage";
import { TemplatesPage } from "./pages/TemplatesPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/exceptions/:exceptionId" element={<ExceptionDetailPage />} />
          <Route path="/checkins" element={<CheckinsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/add" element={<AddClientPage />} />
          <Route path="/clients/new" element={<Navigate to="/clients/add" replace />} />
          <Route
            path="/clients/:relationshipId/onboarding"
            element={<OnboardingReviewPage />}
          />
          <Route
            path="/clients/:relationshipId/configure"
            element={<ConfigureCoachingPage />}
          />
          <Route
            path="/clients/:relationshipId/check-ins/:checkinId"
            element={<CheckinReviewPage />}
          />
          <Route
            path="/clients/:relationshipId"
            element={<ClientWorkspaceLayout />}
          >
            <Route index element={<ClientOverviewPage />} />
            <Route path="overview" element={<ClientOverviewPage />} />
            <Route path="plan" element={<ClientPlanPage />} />
            <Route path="activity" element={<ClientActivityPage />} />
            <Route path="progress" element={<ClientProgressPage />} />
            <Route path="check-ins" element={<ClientCheckinsPage />} />
            <Route path="history" element={<ClientHistoryPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
