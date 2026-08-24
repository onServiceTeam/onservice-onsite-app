import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getChangeOrders: jest.fn().mockResolvedValue([{
    id: 'change-1', bookingId: 'booking-1', status: 'approved', description: 'Replace damaged valve',
    additionalAmount: 50000, additionalServiceFee: 0, additionalTotal: 50000,
    photos: [], lineItems: [], createdAt: '2026-08-24T01:00:00.000Z',
  }]),
  respondToChangeOrder: jest.fn(),
  payChangeOrder: jest.fn(),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 10000, pendingBalance: 0 }),
}));

import ChangeOrderScreen from '../app/customer/booking/change-order';

it('Bug UX-220 — an approved change order with a short wallet explains the real payment hold instead of telling the customer to top up', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ChangeOrderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Pay Additional Amount'));
  expect(screen.getByText(/New wallet top-ups and external authorization are temporarily unavailable/i)).toBeTruthy();
  expect(screen.getByText(/This change order cannot be paid until your existing balance is enough/i)).toBeTruthy();
  expect(screen.queryByText(/top up first/i)).toBeNull();
});
