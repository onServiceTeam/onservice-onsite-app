import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ProvidersPage from '@/pages/ProvidersPage';
import CustomersPage from '@/pages/CustomersPage';
import BookingsPage from '@/pages/BookingsPage';
import CatalogPage from '@/pages/CatalogPage';
import DisputesPage from '@/pages/DisputesPage';
import FinancialsPage from '@/pages/FinancialsPage';
import PayoutsPage from '@/pages/PayoutsPage';
import NotificationTemplatesPage from '@/pages/NotificationTemplatesPage';
import RecurringPage from '@/pages/RecurringPage';
import BusinessAccountsPage from '@/pages/BusinessAccountsPage';
import ServiceAreasPage from '@/pages/ServiceAreasPage';
import AnalyticsPage from '@/pages/AnalyticsPage';

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
