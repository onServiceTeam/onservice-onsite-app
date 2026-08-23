import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
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

it('Bug UX-028 — provider job detail keeps execution actions beside the job record on wide screens', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderJobDetailScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Provider job execution workspace');
  const actionRail = screen.getByLabelText('Job earnings and actions');
  expect(workspace.contains(actionRail)).toBe(true);
  expect(actionRail.textContent).toContain('Mark Complete');
  expect(actionRail.textContent).toContain('Job Checklist');
  expect(screen.getByText('Paolo Garcia')).toBeTruthy();
});
