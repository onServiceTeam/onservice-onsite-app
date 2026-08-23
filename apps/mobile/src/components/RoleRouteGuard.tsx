import React from 'react';
import { Redirect } from 'expo-router';
import { Routes } from '@/config/navigation';
import { useAuthStore, type User } from '@/stores/auth.store';

export type AppRole = User['role'];

export function getRoleHomeRoute(role: AppRole):
  | typeof Routes.TABS.HOME
  | typeof Routes.PROVIDER_TABS.DASHBOARD
  | typeof Routes.STAFF.JOBS
  | typeof Routes.AUTH.LOGIN {
  if (role === 'provider') return Routes.PROVIDER_TABS.DASHBOARD;
  if (role === 'provider_staff') return Routes.STAFF.JOBS;
  if (role === 'customer') return Routes.TABS.HOME;
  return Routes.AUTH.LOGIN;
}

export function RoleRouteGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly AppRole[];
  children: React.ReactNode;
}): React.ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated || !userRole) {
    return <Redirect href={Routes.AUTH.LOGIN} />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Redirect href={getRoleHomeRoute(userRole)} />;
  }

  return <>{children}</>;
}

export default RoleRouteGuard;
