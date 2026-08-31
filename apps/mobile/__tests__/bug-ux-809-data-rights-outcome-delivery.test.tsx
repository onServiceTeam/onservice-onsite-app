import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/compliance.service', () => ({
  listMyDsrs: jest.fn().mockResolvedValue([
    {
      id: 'dsr-completed',
      requestType: 'access',
      status: 'completed',
      receivedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-16T00:00:00Z',
      completedAt: '2026-08-10T00:00:00Z',
      userMessage: 'Please provide my booking history.',
      responsePayloadUrl: 'https://secure.onservice.ph/dsr/dsr-completed',
      rejectionReason: null,
      daysUntilDue: 0,
      isOverdue: false,
    },
    {
      id: 'dsr-rejected',
      requestType: 'erasure',
      status: 'rejected',
      receivedAt: '2026-08-02T00:00:00Z',
      dueAt: '2026-08-17T00:00:00Z',
      completedAt: '2026-08-11T00:00:00Z',
      userMessage: 'Remove everything immediately.',
      responsePayloadUrl: null,
      rejectionReason: 'Payment and tax records must be retained while the account is anonymized.',
      daysUntilDue: 0,
      isOverdue: false,
    },
  ]),
  listPendingMaterialConsents: jest.fn().mockResolvedValue([]),
  recordConsent: jest.fn(),
  submitDataSubjectRequest: jest.fn(),
}));

import DataRightsScreen from '../app/customer/data-rights';

it('Bug UX-809 — a customer can use a completed response and understand a rejected data-rights outcome', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DataRightsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Open secure response')).toBeTruthy();
  expect(screen.getByText(/Payment and tax records must be retained/i)).toBeTruthy();
  expect(screen.getByText(/current target is for the Data Protection Officer to respond within 15 days/i)).toBeTruthy();
  expect(screen.queryByText(/NPC SLA/i)).toBeNull();

  fireEvent.click(screen.getByLabelText('Open response for access request'));
  await waitFor(() => {
    expect(Linking.openURL).toHaveBeenCalledWith('https://secure.onservice.ph/dsr/dsr-completed');
  });
});
