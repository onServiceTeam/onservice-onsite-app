import { useEffect, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProvidersPage = lazy(() => import('@/pages/ProvidersPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const BookingsPage = lazy(() => import('@/pages/BookingsPage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const DisputesPage = lazy(() => import('@/pages/DisputesPage'));
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'));
const PayoutsPage = lazy(() => import('@/pages/PayoutsPage'));
const NotificationTemplatesPage = lazy(() => import('@/pages/NotificationTemplatesPage'));
const RecurringPage = lazy(() => import('@/pages/RecurringPage'));
const BusinessAccountsPage = lazy(() => import('@/pages/BusinessAccountsPage'));
const ServiceAreasPage = lazy(() => import('@/pages/ServiceAreasPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/disputes" element={<DisputesPage />} />
        <Route path="/financials" element={<FinancialsPage />} />
        <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/notification-templates" element={<NotificationTemplatesPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/business-accounts" element={<BusinessAccountsPage />} />
        <Route path="/service-areas" element={<ServiceAreasPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Route>
    </Routes>
  );
}
