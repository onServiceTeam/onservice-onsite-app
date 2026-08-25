import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockUpdateBookingStatus = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
}));
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    bookingType: 'fixed_price',
    status: 'in_progress',
    servicePrice: 120000,
    description: 'Clean one split-type air conditioner',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    latitude: 10.3157,
    longitude: 123.8854,
    scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Paolo Garcia',
    serviceName: 'Aircon Cleaning',
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('Bug UX-361 — the canonical provider job record enters the proof-aware completion workflow instead of patching completion directly', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderJobDetailScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByText('Review & Complete'));
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-1/complete');
  expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
});
