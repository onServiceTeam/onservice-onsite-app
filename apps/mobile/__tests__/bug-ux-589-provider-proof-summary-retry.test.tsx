import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBookingProofSummary } from '@/services/booking-proof.service';

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
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: jest.fn().mockRejectedValue(new Error('proof unavailable')),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', bookingType: 'fixed_price', status: 'paid', servicePrice: 100000,
    scheduledAt: '2026-08-24T01:00:00.000Z', createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Ana Cruz', serviceName: 'Aircon Cleaning', address: '88 Banilad Road', city: 'Mandaue City',
  }),
  getMyDisputes: jest.fn(),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('Bug UX-589 — a failed proof summary has a direct retry before providers rely on completion evidence', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderJobDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Proof status unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getBookingProofSummary).toHaveBeenCalledTimes(2));
});
