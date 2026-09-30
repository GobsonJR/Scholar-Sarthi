import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PublicShell } from "./layouts/PublicShell";
import { SchemesExplorer } from "./pages/SchemesExplorer";
import { SchemeDetailsPage } from "./pages/SchemeDetailsPage";
import { ApplicantLayout } from "./layouts/ApplicantLayout";
import { OfficerLayout } from "./layouts/OfficerLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardPage } from "./pages/applicant/DashboardPage";
import { DiscoverSchemesPage } from "./pages/applicant/DiscoverSchemesPage";
import { MyApplicationsPage } from "./pages/applicant/MyApplicationsPage";
import { ApplicationWizardPage } from "./pages/applicant/ApplicationWizardPage";
import { ApplicationDetailPage } from "./pages/applicant/ApplicationDetailPage";
import { NotificationsPage } from "./pages/applicant/NotificationsPage";
import { ProfilePage } from "./pages/applicant/ProfilePage";
import { AssistantPage } from "./pages/applicant/AssistantPage";
import { LoadingState } from "./components/ui/States";

// Officer pages are code-split: they pull in Recharts (the largest dependency
// in the bundle) and are never needed by an applicant session.
const OfficerDashboardPage = lazy(() => import("./pages/officer/OfficerDashboardPage").then((m) => ({ default: m.OfficerDashboardPage })));
const OfficerApplicationsListPage = lazy(() =>
  import("./pages/officer/OfficerApplicationsListPage").then((m) => ({ default: m.OfficerApplicationsListPage })),
);
const ApplicationReviewPage = lazy(() => import("./pages/officer/ApplicationReviewPage").then((m) => ({ default: m.ApplicationReviewPage })));
const ReportsPage = lazy(() => import("./pages/officer/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const AuditLogsPage = lazy(() => import("./pages/officer/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })));
const SchemesAdminPage = lazy(() => import("./pages/officer/SchemesAdminPage").then((m) => ({ default: m.SchemesAdminPage })));
const SchemeFormPage = lazy(() => import("./pages/officer/SchemeFormPage").then((m) => ({ default: m.SchemeFormPage })));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading..." />}>{children}</Suspense>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<PublicShell />}>
          <Route path="/schemes" element={<SchemesExplorer basePath="/schemes" />} />
          <Route path="/schemes/:id" element={<SchemeDetailsPage />} />
        </Route>

        <Route
          path="/app"
          element={
            <ProtectedRoute role="applicant">
              <ApplicantLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="schemes" element={<DiscoverSchemesPage />} />
          <Route path="schemes/:id" element={<SchemeDetailsPage />} />
          <Route path="applications" element={<MyApplicationsPage />} />
          <Route path="applications/:id/wizard" element={<ApplicationWizardPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route
          path="/officer"
          element={
            <ProtectedRoute role="officer">
              <OfficerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<LazyPage><OfficerDashboardPage /></LazyPage>} />
          <Route path="applications" element={<LazyPage><OfficerApplicationsListPage /></LazyPage>} />
          <Route path="flagged" element={<LazyPage><OfficerApplicationsListPage flaggedOnly /></LazyPage>} />
          <Route path="applications/:id" element={<LazyPage><ApplicationReviewPage /></LazyPage>} />
          <Route path="schemes" element={<LazyPage><SchemesAdminPage /></LazyPage>} />
          <Route path="schemes/new" element={<LazyPage><SchemeFormPage /></LazyPage>} />
          <Route path="schemes/:id/edit" element={<LazyPage><SchemeFormPage /></LazyPage>} />
          <Route path="reports" element={<LazyPage><ReportsPage /></LazyPage>} />
          <Route path="audit-logs" element={<LazyPage><AuditLogsPage /></LazyPage>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
