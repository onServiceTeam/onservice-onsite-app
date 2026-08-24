import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 200000 }),
}));

import CheckoutScreen from '../app/customer/booking/checkout';

it('Bug UX-223 — desktop checkout removes the deferred guarantee and describes the actual wallet and escrow record', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CheckoutScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Desktop booking checkout workspace')).toBeTruthy();
  expect(screen.getByText(/server-verified payment and escrow status stays visible/i)).toBeTruthy();
  expect(screen.getByText(/external PayMongo payment methods are currently unavailable/i)).toBeTruthy();
  expect(screen.queryByText(/Service Guarantee/i)).toBeNull();
  expect(screen.queryByText(/up to ₱10,000/i)).toBeNull();
});
