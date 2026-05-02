import React, { useEffect, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuthStore } from '@/stores/auth.store';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProvidersPage = lazy(() => import('@/pages/ProvidersPage'));
const ProviderDetailPage = lazy(() => import('@/pages/ProviderDetailPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'));
const BookingsPage = lazy(() => import('@/pages/BookingsPage'));
const BookingDetailPage = lazy(() => import('@/pages/BookingDetailPage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const DisputesPage = lazy(() => import('@/pages/DisputesPage'));
const DisputeDetailPage = lazy(() => import('@/pages/DisputeDetailPage'));
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'));
const PayoutsPage = lazy(() => import('@/pages/PayoutsPage'));
const NotificationTemplatesPage = lazy(() => import('@/pages/NotificationTemplatesPage'));
const RecurringPage = lazy(() => import('@/pages/RecurringPage'));
const BusinessAccountsPage = lazy(() => import('@/pages/BusinessAccountsPage'));
const ServiceAreasPage = lazy(() => import('@/pages/ServiceAreasPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const SystemSettingsPage = lazy(() => import('@/pages/SystemSettingsPage'));
const CancellationPolicyPage = lazy(() => import('@/pages/settings/CancellationPolicyPage'));
const SupportTicketsPage = lazy(() => import('@/pages/SupportTicketsPage'));
const StaffRolesPage = lazy(() => import('@/pages/StaffRolesPage'));
const PricingRulesPage = lazy(() => import('@/pages/PricingRulesPage'));
const MarketingPage = lazy(() => import('@/pages/MarketingPage'));
const DispatchConsolePage = lazy(() => import('@/pages/DispatchConsolePage'));
const CompliancePage = lazy(() => import('@/pages/CompliancePage'));
const DataProtectionLogPage = lazy(() => import('@/pages/DataProtectionLogPage'));
const ConsentVersionsPage = lazy(() => import('@/pages/ConsentVersionsPage'));
// Phase L MED-L01 fix — 404 catch-all page.
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/disputes" element={<DisputesPage />} />
          <Route path="/disputes/:id" element={<DisputeDetailPage />} />
          <Route path="/financials" element={<FinancialsPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/notification-templates" element={<NotificationTemplatesPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/business-accounts" element={<BusinessAccountsPage />} />
          <Route path="/service-areas" element={<ServiceAreasPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/support-tickets" element={<SupportTicketsPage />} />
          <Route path="/staff" element={<StaffRolesPage />} />
          <Route path="/settings" element={<SystemSettingsPage />} />
          <Route path="/settings/cancellation-policy" element={<CancellationPolicyPage />} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/dispatch" element={<DispatchConsolePage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/data-protection-log" element={<DataProtectionLogPage />} />
          <Route path="/consent-versions" element={<ConsentVersionsPage />} />
          <Route path="/pricing-rules" element={<PricingRulesPage />} />
          {/* Phase L MED-L01 fix — catch-all 404. Inside AdminLayout
               so admin chrome stays visible; pre-fix typoed URLs just
               rendered a blank page. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Sentry.ErrorBoundary>
  );
}
