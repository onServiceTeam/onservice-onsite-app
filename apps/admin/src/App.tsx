import React, { useEffect, lazy } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuthStore } from '@/stores/auth.store';
import type { AdminUser } from '@/stores/auth.store';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';
// LAUNCH-LIMITATIONS #12 — must-rotate-password redirect target.
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProvidersPage = lazy(() => import('@/pages/ProvidersPage'));
const ProviderDetailPage = lazy(() => import('@/pages/ProviderDetailPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'));
const BookingsPage = lazy(() => import('@/pages/BookingsPage'));
const BookingDetailPage = lazy(() => import('@/pages/BookingDetailPage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const DisputesPage = lazy(() => import('@/pages/DisputesPage'));
const DisputeDetailPage = lazy(() => import('@/pages/DisputeDetailPage'));
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'));
const PayoutsPage = lazy(() => import('@/pages/PayoutsPage'));
const NotificationTemplatesPage = lazy(() => import('@/pages/NotificationTemplatesPage'));
const RecurringPage = lazy(() => import('@/pages/RecurringPage'));
const BusinessAccountsPage = lazy(() => import('@/pages/BusinessAccountsPage'));
const BusinessAccountDetailPage = lazy(() => import('@/pages/BusinessAccountDetailPage'));
const ServiceAreasPage = lazy(() => import('@/pages/ServiceAreasPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const SecurityOperationsPage = lazy(() => import('@/pages/SecurityOperationsPage'));
const SystemSettingsPage = lazy(() => import('@/pages/SystemSettingsPage'));
const CancellationPolicyPage = lazy(() => import('@/pages/settings/CancellationPolicyPage'));
const SupportTicketsPage = lazy(() => import('@/pages/SupportTicketsPage'));
const StaffRolesPage = lazy(() => import('@/pages/StaffRolesPage'));
const PricingRulesPage = lazy(() => import('@/pages/PricingRulesPage'));
const MarketingPage = lazy(() => import('@/pages/MarketingPage'));
const DispatchConsolePage = lazy(() => import('@/pages/DispatchConsolePage'));
const CommunicationsPage = lazy(() => import('@/pages/CommunicationsPage'));
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage'));
const CompliancePage = lazy(() => import('@/pages/CompliancePage'));
const DataProtectionLogPage = lazy(() => import('@/pages/DataProtectionLogPage'));
const ConsentVersionsPage = lazy(() => import('@/pages/ConsentVersionsPage'));
const PrivacyWorkspacePage = lazy(() => import('@/pages/PrivacyWorkspacePage'));
// Phase L MED-L01 fix — 404 catch-all page.
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

// LAUNCH-LIMITATIONS #12 — route guard layout. When the auth store
// has mustRotatePassword=true the user is forced to /change-password
// regardless of where they tried to navigate. The change-password
// page itself is mounted OUTSIDE this guard (sibling route under
// AdminLayout) so the redirect target stays reachable without an
// infinite loop.
function MustRotateGuard(): React.ReactElement {
  const mustRotate = useAuthStore((s) => s.mustRotatePassword);
  const location = useLocation();
  if (mustRotate && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

export function RoleRouteGuard({
  allowed,
}: {
  allowed: AdminUser['role'][];
}): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !allowed.includes(role)) {
    return <Navigate to={role === 'dpo' ? '/privacy' : '/'} replace />;
  }
  return <Outlet />;
}

export function RoleHome(): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'dpo') return <Navigate to="/privacy" replace />;
  return <DashboardPage />;
}

export default function App(): React.ReactElement {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="p-8 text-center">
          <p>Something went wrong. Please refresh.</p>
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AdminLayout />}>
          {/* LL#12 — change-password is reachable inside the admin
              layout chrome so the user keeps context. Not wrapped in
              MustRotateGuard (it's the redirect target). */}
          <Route path="/change-password" element={<ChangePasswordPage />} />
          {/* All other admin routes are gated by MustRotateGuard via
              the wrapper element below; if mustRotatePassword=true the
              guard redirects to /change-password. */}
          <Route element={<MustRotateGuard />}>
            <Route path="/" element={<RoleHome />} />
            <Route element={<RoleRouteGuard allowed={['admin', 'super_admin']} />}>
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/providers/:id" element={<ProviderDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/bookings" element={<BookingsPage />} />
              <Route path="/bookings/:id" element={<BookingDetailPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/disputes" element={<DisputesPage />} />
              <Route path="/disputes/:id" element={<DisputeDetailPage />} />
              <Route path="/financials" element={<FinancialsPage />} />
              <Route path="/payouts" element={<PayoutsPage />} />
              <Route path="/notification-templates" element={<NotificationTemplatesPage />} />
              <Route path="/recurring" element={<RecurringPage />} />
              <Route path="/business-accounts" element={<BusinessAccountsPage />} />
              <Route path="/business-accounts/:id" element={<BusinessAccountDetailPage />} />
              <Route path="/service-areas" element={<ServiceAreasPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/audit-log" element={<AuditLogPage />} />
              <Route path="/security" element={<SecurityOperationsPage />} />
              <Route path="/support-tickets" element={<SupportTicketsPage />} />
              <Route path="/settings" element={<SystemSettingsPage />} />
              <Route path="/settings/cancellation-policy" element={<CancellationPolicyPage />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/dispatch" element={<DispatchConsolePage />} />
              <Route path="/communications" element={<CommunicationsPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/pricing-rules" element={<PricingRulesPage />} />
            </Route>
            <Route element={<RoleRouteGuard allowed={['super_admin']} />}>
              <Route path="/staff" element={<StaffRolesPage />} />
            </Route>
            <Route element={<RoleRouteGuard allowed={['dpo', 'super_admin']} />}>
              <Route path="/privacy" element={<PrivacyWorkspacePage />} />
              <Route path="/data-protection-log" element={<DataProtectionLogPage />} />
              <Route path="/consent-versions" element={<ConsentVersionsPage />} />
            </Route>
            {/* Phase L MED-L01 fix — catch-all 404. Inside AdminLayout
                 so admin chrome stays visible; pre-fix typoed URLs just
                 rendered a blank page. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Sentry.ErrorBoundary>
  );
}
