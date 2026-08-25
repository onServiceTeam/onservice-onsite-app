import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockResolvedValue(null),
  getDataExportStatus: jest.fn().mockResolvedValue([]),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(),
  getDataExportDownloadUrl: jest.fn(),
}));

import AccountManagementScreen from '../app/customer/account-management';

it('Bug UX-395 — customer account and data actions have explicit names and the deactivation form exposes its purpose', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AccountManagementScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop account data workspace')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go back from account and data' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Request JSON data export' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Request CSV data export' })).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Request account deactivation' }));
  expect(screen.getByLabelText('Reason for account deactivation')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue to confirm account deactivation' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel account deactivation form' })).toBeTruthy();
});
