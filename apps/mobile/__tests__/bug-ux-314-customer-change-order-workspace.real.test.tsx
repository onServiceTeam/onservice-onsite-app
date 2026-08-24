import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    serviceName: 'Deep Cleaning',
    providerName: 'Cebu Prime Care',
    description: 'Original whole-home cleaning scope.',
    scheduledAt: '2026-08-25T02:00:00.000Z',
  }),
  getChangeOrders: jest.fn().mockResolvedValue([
    {
      id: 'order-1',
      bookingId: 'booking-1',
      providerId: 'provider-1',
      description: 'Add oven cleaning',
      additionalAmount: 50000,
      additionalServiceFee: 10000,
      additionalTotal: 60000,
      lineItems: [],
      photos: ['https://example.com/evidence.jpg'],
      status: 'approved',
      customerRespondedAt: '2026-08-25T00:00:00.000Z',
      createdAt: '2026-08-24T00:00:00.000Z',
    },
  ]),
  respondToChangeOrder: jest.fn(),
  payChangeOrder: jest.fn(),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockRejectedValue(new Error('wallet unavailable')),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import ChangeOrderScreen from '../app/customer/booking/change-order';

it('Bug UX-314 — customer change orders use a wide scope workspace and never treat a failed wallet query as a zero balance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ChangeOrderScreen />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByLabelText('Tablet and desktop customer change order workspace'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Change order booking context')).toBeTruthy();
  fireEvent.click(screen.getByText('Pay Additional Amount'));

  expect(await screen.findByLabelText('Wallet balance error state')).toBeTruthy();
  expect(screen.queryByText('Wallet balance: ₱0.00')).toBeNull();
  expect(screen.getByText('Pay ₱600.00').closest('button')?.hasAttribute('disabled')).toBe(true);
});
