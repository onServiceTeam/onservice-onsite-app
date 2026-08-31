import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockRejectedValue(new Error('status unavailable')),
  getDataExportStatus: jest.fn().mockResolvedValue([]),
  requestAccountDeletion: jest.fn(), cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(), getDataExportDownloadUrl: jest.fn(),
}));

import AccountManagementScreen from '../app/customer/account-management';

it('Bug UX-613 — customer deactivation controls stay hidden until current account status is verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AccountManagementScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't verify whether a deactivation request already exists/i)).toBeTruthy();
  expect(screen.queryByText('Request Account Deactivation')).toBeNull();
});
