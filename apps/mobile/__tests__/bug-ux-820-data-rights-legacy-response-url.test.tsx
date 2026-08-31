import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/compliance.service', () => ({
  listMyDsrs: jest.fn().mockResolvedValue([{
    id: 'dsr-legacy-url',
    requestType: 'access',
    status: 'completed',
    receivedAt: '2026-08-01T00:00:00Z',
    dueAt: '2026-08-16T00:00:00Z',
    completedAt: '2026-08-10T00:00:00Z',
    userMessage: null,
    responsePayloadUrl: 'https://',
    rejectionReason: null,
    daysUntilDue: 0,
    isOverdue: false,
  }]),
  listPendingMaterialConsents: jest.fn().mockResolvedValue([]),
  recordConsent: jest.fn(),
  submitDataSubjectRequest: jest.fn(),
}));

import DataRightsScreen from '../app/customer/data-rights';

it('Bug UX-820 — a malformed legacy response URL is not presented as an actionable customer link', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DataRightsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Access')).toBeTruthy();
  expect(screen.queryByText('Open secure response')).toBeNull();
});
