import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { respondToChangeOrder } from '@/services/booking.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ bookingId: 'booking-1' }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }) }));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', serviceName: 'Deep Cleaning', description: 'Original cleaning scope.' }),
  getChangeOrders: jest.fn().mockResolvedValue([{
    id: 'order-1', bookingId: 'booking-1', providerId: 'provider-1', description: 'Add oven cleaning',
    additionalAmount: 50000, additionalServiceFee: 10000, additionalTotal: 60000,
    lineItems: [], photos: [], status: 'pending', createdAt: '2026-08-25T00:00:00.000Z',
  }]),
  respondToChangeOrder: jest.fn().mockResolvedValue({ id: 'order-1', bookingId: 'booking-1', status: 'approved', paymentRequired: true, additionalAmount: 50000, additionalTotal: 60000 }),
  payChangeOrder: jest.fn(),
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 100000, pendingBalance: 0 }) }));

import ChangeOrderScreen from '../app/customer/booking/change-order';

it('Bug UX-392 — approving a change order uses an in-app browser-safe decision with amount and payment-state context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ChangeOrderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Approve change order for ₱500.00' }));
  const dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('added amount must still be paid');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Approve Change Order' }));
  await waitFor(() => expect(respondToChangeOrder).toHaveBeenCalledWith('order-1', true));
});
