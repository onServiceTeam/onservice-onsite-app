import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockResolvedValue(null),
  getDataExportStatus: jest.fn().mockResolvedValue([{
    id: 'expired-1', userId: 'user-1', status: 'expired', format: 'csv', fileUrl: null,
    downloadAvailable: false, fileSizeBytes: 50, completedAt: '2026-07-01T00:00:00Z',
    expiresAt: '2026-07-08T00:00:00Z', errorMessage: null, createdAt: '2026-07-01T00:00:00Z',
  }]),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(),
  getDataExportDownloadUrl: jest.fn(),
}));

import CustomerAccountManagementScreen from '../app/customer/account-management';
import ProviderAccountManagementScreen from '../app/provider/account-management';

function wrap(screenElement: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{screenElement}</QueryClientProvider>;
}

it('BUG-PHASE96-01 — customer and provider screens label an expired export and withhold its download action', async () => {
  const customer = render(wrap(<CustomerAccountManagementScreen />));
  expect(await screen.findByText('Expired — request again')).toBeTruthy();
  expect(screen.queryByText('Download')).toBeNull();
  customer.unmount();

  render(wrap(<ProviderAccountManagementScreen />));
  expect(await screen.findByText('Expired — request again')).toBeTruthy();
  expect(screen.queryByText('Download')).toBeNull();
});
