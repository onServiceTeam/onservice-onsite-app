import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/compliance.service', () => ({
  listMyDsrs: jest.fn().mockResolvedValue([]),
  listPendingMaterialConsents: jest.fn().mockResolvedValue([]),
  recordConsent: jest.fn(),
  submitDataSubjectRequest: jest.fn(),
}));

import DataRightsScreen from '../app/customer/data-rights';

it('Bug UX-657 — a data-access request promises tracked handling without assuming every customer has a registered email', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DataRightsScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByLabelText('Download My Data'));
  expect(screen.getByText(/update this request within 15 days/i)).toBeTruthy();
  expect(screen.getByText(/secure delivery method is needed/i)).toBeTruthy();
  expect(screen.queryByText(/send a download link to your registered email/i)).toBeNull();
});
