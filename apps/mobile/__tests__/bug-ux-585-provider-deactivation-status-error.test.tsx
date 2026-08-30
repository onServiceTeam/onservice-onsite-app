import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getAccountDeletionStatus } from '@/services/data-management.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockRejectedValue(new Error('status unavailable')),
  getDataExportStatus: jest.fn().mockResolvedValue([]),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(),
  getDataExportDownloadUrl: jest.fn(),
}));

import AccountManagementScreen from '../app/provider/account-management';

it('Bug UX-585 — provider deactivation controls stay hidden until pending status is confirmed', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AccountManagementScreen /></QueryClientProvider>);

  expect(await screen.findByText('Deactivation status unavailable')).toBeTruthy();
  expect(screen.queryByText('Request Account Deactivation')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getAccountDeletionStatus).toHaveBeenCalledTimes(2));
});
