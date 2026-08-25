import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSendTip = jest.fn().mockResolvedValue({});

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), useLocalSearchParams: () => ({ bookingId: 'booking-1' }) }));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100000 }) }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 500000, pendingBalance: 0 }) }));
jest.mock('@/services/tip.service', () => ({ sendTip: (...args: unknown[]) => mockSendTip(...args) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 500000 } } }) } }));

import TipScreen from '../app/customer/booking/tip';

it('Bug PHASE193-01 — a rendered optional message is capped and sent with the selected tip', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  const message = await screen.findByLabelText('Optional tip message');
  expect(message.getAttribute('maxlength')).toBe('500');
  fireEvent.change(message, { target: { value: 'Thanks for the careful work.' } });
  fireEvent.click(screen.getByRole('button', { name: /Tip 10 percent/i }));
  fireEvent.click(screen.getByText(/Send Tip/));

  await waitFor(() => expect(mockSendTip).toHaveBeenCalledWith(expect.objectContaining({
    bookingId: 'booking-1', amount: 10000, paymentMethod: 'wallet', message: 'Thanks for the careful work.',
  })));
});
