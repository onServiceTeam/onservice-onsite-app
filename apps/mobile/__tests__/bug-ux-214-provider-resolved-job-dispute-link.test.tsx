import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.13 } } }) },
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', bookingType: 'fixed_price', status: 'resolved', servicePrice: 100000,
    serviceFee: 0, totalAmount: 100000, scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z', customerName: 'Ana Cruz', serviceName: 'Aircon Cleaning',
    address: '88 Banilad Road', barangay: 'Banilad', city: 'Mandaue City', latitude: 10.3, longitude: 123.9,
  }),
  getMyDisputes: jest.fn().mockResolvedValue({
    disputes: [{ id: 'dispute-1', providerRespondedAt: '2026-08-24T02:00:00.000Z' }],
    page: 1, total: 1, totalPages: 1,
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('Bug UX-214 — a resolved provider job retains the linked dispute case and decision entry point', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderJobDetailScreen /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'View Dispute Case' })).toBeTruthy();
  expect(screen.getByText('Dispute Resolved')).toBeTruthy();
});
