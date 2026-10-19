import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { CodeSignInPage } from "./auth/CodeSignInPage";
import { ForgotPasswordPage } from "./auth/ForgotPasswordPage";
import { SetPasswordPage } from "./auth/SetPasswordPage";
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
import { PlanBuilderPage } from "./pages/plan/PlanBuilderPage";
import { GoResolverPage } from "./pages/GoResolverPage";
import { ClientProgressPage } from "./pages/ClientProgressPage";
import { ClientWorkspaceLayout } from "./pages/ClientWorkspaceLayout";
import { ClientsPage } from "./pages/ClientsPage";
import { ConfigureCoachingPage } from "./pages/ConfigureCoachingPage";
import { ExceptionDetailPage } from "./pages/ExceptionDetailPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OnboardingReviewPage } from "./pages/OnboardingReviewPage";
import { PendingInvitationPage } from "./pages/PendingInvitationPage";
import { TemplatesHub } from "./pages/TemplatesHub";
import { WelcomePage } from "./pages/WelcomePage";
import { EndedClientsSettingsPage } from "./pages/settings/EndedClientsSettingsPage";
import { NotificationSettingsPage } from "./pages/settings/NotificationSettingsPage";
import { ProfileSettingsPage } from "./pages/settings/ProfileSettingsPage";
import { PrivacyDataPage } from "./pages/settings/PrivacyDataPage";
import { SettingsHelpPage } from "./pages/settings/SettingsHelpPage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { UnitsLanguagePage } from "./pages/settings/UnitsLanguagePage";
import { SpecimensPage } from "./pages/SpecimensPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-in/code" element={<CodeSignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/__specimens" element={<SpecimensPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/exceptions/:exceptionId" element={<ExceptionDetailPage />} />
          <Route path="/checkins" element={<CheckinsPage />} />
          <Route path="/links/resolve" element={<GoResolverPage />} />
          <Route
            path="/clients/:relationshipId/plan/:planId/versions/:versionId/edit"
            element={<PlanBuilderPage />}
          />
          <Route path="/templates/*" element={<TemplatesHub />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/add" element={<AddClientPage />} />
          <Route path="/clients/new" element={<Navigate to="/clients/add" replace />} />
          <Route path="/invitations/:invitationId" element={<PendingInvitationPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfileSettingsPage />} />
            <Route path="notifications" element={<NotificationSettingsPage />} />
            <Route path="ended" element={<EndedClientsSettingsPage />} />
            <Route path="units" element={<UnitsLanguagePage />} />
            <Route path="help" element={<SettingsHelpPage />} />
            <Route path="privacy" element={<PrivacyDataPage />} />
          </Route>
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
            <Route path="check-ins/:checkinId" element={<CheckinReviewPage />} />
            <Route path="history" element={<ClientHistoryPage />} />
            <Route path="onboarding" element={<OnboardingReviewPage />} />
            <Route path="configure" element={<ConfigureCoachingPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
