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

function renderScreen(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <DataRightsScreen />
    </QueryClientProvider>,
  );
}

it('BUG-UX-194 — the erasure request explains cooling-off, anonymization, and retained records without promising full deletion', () => {
  renderScreen();
  fireEvent.click(screen.getByLabelText('Deactivate & Anonymize My Account'));

  expect(screen.getByText(/30-day cooling-off period applies before processing/i)).toBeTruthy();
  expect(screen.getByText(/records may be retained where required/i)).toBeTruthy();
  expect(screen.getByText(/Processing starts after a 30-day cooling-off period/i)).toBeTruthy();
  expect(screen.queryByText(/This action is irreversible/i)).toBeNull();
});
