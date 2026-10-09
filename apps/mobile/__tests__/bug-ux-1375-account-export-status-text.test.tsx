import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockResolvedValue(null),
  getDataExportStatus: jest.fn(), requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(), requestDataExport: jest.fn(), getDataExportDownloadUrl: jest.fn(),
}));

import { getDataExportStatus, type DataExportEntry } from '@/services/data-management.service';
import CustomerAccount from '../app/customer/account-management';
import ProviderAccount from '../app/provider/account-management';

it('Bug UX-1375 — customer and provider export history explains every state in text instead of relying on icon color', async () => {
  for (const Component of [CustomerAccount, ProviderAccount]) {
    for (const [status, downloadable, label] of [
      ['pending', false, 'Queued'],
      ['processing', false, 'Preparing'],
      ['failed', false, 'Failed. Request a new export.'],
      ['expired', false, 'Expired — request again'],
      ['completed', true, 'Ready to download'],
      ['completed', false, 'Download unavailable. Request a new export.'],
    ] as const) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const entry: DataExportEntry = {
        id: 'export-fixture', userId: 'fixture-owner', status, format: 'json',
        downloadAvailable: downloadable, fileUrl: null, fileSizeBytes: 100,
        completedAt: null, expiresAt: null, errorMessage: 'Private internal fixture error must not be displayed',
        createdAt: '2026-09-01T00:00:00Z',
      };
      jest.mocked(getDataExportStatus).mockResolvedValue([entry]);
      try {
        render(<QueryClientProvider client={client}><Component /></QueryClientProvider>);
        expect(await screen.findByText(label)).toBeTruthy();
        expect(screen.queryByText('Download') !== null).toBe(downloadable);
        expect(screen.queryByText(entry.errorMessage!)).toBeNull();
      } finally { cleanup(); client.clear(); }
    }
  }
});
