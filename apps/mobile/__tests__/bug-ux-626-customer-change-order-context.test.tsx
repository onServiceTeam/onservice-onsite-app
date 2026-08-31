import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn(), getChangeOrders: jest.fn(), respondToChangeOrder: jest.fn(), payChangeOrder: jest.fn(),
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 0 }) }));

import ChangeOrderScreen from '../app/customer/booking/change-order';

it('Bug UX-626 — change orders without a booking do not render a false empty provider record', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ChangeOrderScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking context required')).toBeTruthy();
  expect(screen.getByText('View bookings')).toBeTruthy();
  expect(screen.queryByText('No Change Orders')).toBeNull();
});
