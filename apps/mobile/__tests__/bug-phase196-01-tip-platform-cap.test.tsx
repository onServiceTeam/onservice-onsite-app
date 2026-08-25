import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSendTip = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), useLocalSearchParams: () => ({ bookingId: 'booking-1' }) }));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 1000000 }) }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 2000000, pendingBalance: 0 }) }));
jest.mock('@/services/tip.service', () => ({ sendTip: (...args: unknown[]) => mockSendTip(...args) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 50000 } } }) } }));

import TipScreen from '../app/customer/booking/tip';

it('Bug PHASE196-01 — the rendered tip form applies the live platform cap before submission', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: /Tip 10 percent/i }));
  expect(screen.getByText(/Tip exceeds platform cap/i)).toBeTruthy();
  expect(screen.getByText(/Send Tip/).closest('button')?.hasAttribute('disabled')).toBe(true);
  expect(mockSendTip).not.toHaveBeenCalled();
});
