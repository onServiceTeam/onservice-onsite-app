import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/compliance.service', () => ({
  listMyDsrs: jest.fn().mockResolvedValue([]),
  listPendingMaterialConsents: jest.fn().mockRejectedValue(new Error('consent status unavailable')),
  recordConsent: jest.fn(),
  submitDataSubjectRequest: jest.fn(),
}));

import DataRightsScreen from '../app/customer/data-rights';

it('Bug UX-629 — a failed material-consent lookup is disclosed and recoverable instead of looking like no acknowledgement is due', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DataRightsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Policy acknowledgement status unavailable')).toBeTruthy();
  expect(screen.getByText(/cannot verify whether an updated privacy policy/i)).toBeTruthy();
  expect(screen.getByText('Try Again')).toBeTruthy();
});
