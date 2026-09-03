import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getChangeOrders: jest.fn().mockResolvedValue([{
    id: 'change-1', bookingId: 'booking-1', providerId: 'provider-1',
    status: 'approved', description: 'Additional materials', additionalAmount: 50000,
    additionalServiceFee: null, additionalTotal: null, financialTermsReviewRequired: true,
    photos: [], lineItems: [], createdAt: '2026-08-24T01:00:00.000Z',
  }]),
  respondToChangeOrder: jest.fn(),
  payChangeOrder: jest.fn(),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 100000, pendingBalance: 0 }),
}));

import ChangeOrderScreen from '../app/customer/booking/change-order';

it('Bug OPS-251 — a legacy approved change order shows support review and no unsafe pay action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ChangeOrderScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Change order payment requires support review')).toBeTruthy();
  expect(screen.getByText(/You will not be charged until the total is confirmed/i)).toBeTruthy();
  expect(screen.queryByText('Pay Additional Amount')).toBeNull();
});
