import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToTermsText: jest.fn(),
}));

import TermsScreen from '../app/customer/terms';

it('Bug OPS-221 — customer Terms no longer promise held BIR documents or external payments', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <TermsScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByText('5. Bookings, Pricing & Fees'));
  expect(screen.getByText(/does not currently issue a document represented as an authorized BIR invoice/i)).toBeTruthy();
  expect(screen.queryByText(/Official Receipts are issued electronically/i)).toBeNull();

  fireEvent.click(screen.getByText('6. Escrow Payments'));
  expect(screen.getByText(/External card, GCash, Maya, QR Ph, bank-transfer authorization, and wallet top-up are currently disabled/i)).toBeTruthy();
});
