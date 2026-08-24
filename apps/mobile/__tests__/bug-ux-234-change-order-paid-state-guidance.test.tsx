import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';

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
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn(),
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [], page: 1, total: 0, totalPages: 0 }),
}));

import CustomerBookingDetail from '../app/customer/booking/[id]';
import ProviderJobDetail from '../app/provider/job/[id]';

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

it('Bug UX-234 — customer and provider change-order guidance distinguishes approval from a verified paid-and-held charge', async () => {
  jest.mocked(getBookingById).mockResolvedValueOnce({
    id: 'booking-1', status: 'in_progress', escrowStatus: 'held', servicePrice: 100000,
    serviceFee: 0, totalAmount: 100000, scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z', providerName: 'Cebu Prime',
    serviceName: 'Cabinet Repair', jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
  } as never);
  render(<QueryClientProvider client={client()}><CustomerBookingDetail /></QueryClientProvider>);
  expect(await screen.findByText(/Approval alone is not payment; continue only after the booking shows the added charge as paid and held/i)).toBeTruthy();

  cleanup();
  jest.mocked(getBookingById).mockResolvedValueOnce({
    id: 'booking-1', bookingType: 'fixed_price', status: 'in_progress', escrowStatus: 'held',
    servicePrice: 100000, serviceFee: 0, totalAmount: 100000,
    scheduledAt: '2026-08-24T01:00:00.000Z', createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Ana Cruz', serviceName: 'Cabinet Repair', address: '88 Banilad Road',
    barangay: 'Banilad', city: 'Mandaue City', latitude: 10.3, longitude: 123.9,
  } as never);
  render(<QueryClientProvider client={client()}><ProviderJobDetail /></QueryClientProvider>);
  expect(await screen.findByText(/Approval alone is not payment; continue only after the job shows the added charge as paid and held/i)).toBeTruthy();
});
