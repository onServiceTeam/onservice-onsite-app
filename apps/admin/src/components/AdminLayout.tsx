import React, { Suspense, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import Sidebar from './Sidebar';
import Header from './Header';
import AdminBreadcrumbs from './AdminBreadcrumbs';

function PageLoader(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
    </div>
  );
}

export default function AdminLayout(): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-secondary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Sidebar
        mobileOpen={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        collapsed={navigationCollapsed}
        onToggleCollapsed={() => setNavigationCollapsed((value) => !value)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNavigation={() => setMobileNavigationOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <AdminBreadcrumbs />
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
