import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([]), getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]), getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

it('Bug UX-228 — customer home describes payment status tracking instead of confirmation-only escrow protection', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('Track payment')).toBeTruthy();
  expect(screen.getByText(/Supported payments show paid and escrow status in the booking/i)).toBeTruthy();
  expect(screen.queryByText(/Payment held in escrow until you confirm/i)).toBeNull();
});
