import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';

const mockGetDataExportDownloadUrl = jest.fn().mockResolvedValue('https://api.test/private-export');

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockResolvedValue(null),
  getDataExportStatus: jest.fn().mockResolvedValue([{
    id: 'export-1', userId: 'provider-user-1', status: 'completed', format: 'json',
    fileUrl: null, downloadAvailable: true, fileSizeBytes: 100, completedAt: '2026-08-24T00:00:00Z',
    expiresAt: '2026-08-31T00:00:00Z', errorMessage: null, createdAt: '2026-08-24T00:00:00Z',
  }]),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(),
  getDataExportDownloadUrl: (...args: unknown[]) => mockGetDataExportDownloadUrl(...args),
}));

import ProviderAccountManagementScreen from '../app/provider/account-management';

it('BUG-UX-179 — a provider opens a completed export through the authenticated short-lived download flow', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderAccountManagementScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByTestId('provider-export-download-export-1'));

  await waitFor(() => expect(mockGetDataExportDownloadUrl).toHaveBeenCalledWith('export-1'));
  expect(Linking.openURL).toHaveBeenCalledWith('https://api.test/private-export');
});
