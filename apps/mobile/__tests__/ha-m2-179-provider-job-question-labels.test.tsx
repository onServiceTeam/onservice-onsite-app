// HA-M2-179 (D38 Milestone 2, package P5b; the Milestone 1 deferred finding):
// on the provider's job screen, a quote request's answers show under the
// questions the admin wrote (from the request detail's intakeQuestions),
// not as internal keys turned into words ("Unit count").
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, providerRequestFixture, quoteFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/hooks/useLocation', () => ({ useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }) }));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockResolvedValue(null) }));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-req-1', bookingType: 'quote_based', status: 'paid', servicePrice: 180000,
    description: 'Bedroom aircon blows warm air.', address: '88 Banilad Road', barangay: 'Banilad', city: 'Cebu City',
    latitude: 10.33, longitude: 123.91, scheduledAt: '2026-10-15T00:00:00.000Z', createdAt: '2026-10-14T00:30:00.000Z',
    customerName: 'Ana Reyes', serviceName: 'Aircon repair', intakeAnswers: { unit_count: 2, has_power: false },
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('HA-M2-179: the provider job screen shows each answer under the admin-written question instead of the internal key', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests/booking-req-1': ok(providerRequestFixture({
      intakeAnswers: { unit_count: 2, has_power: false },
      intakeQuestions: [
        { key: 'unit_count', label: 'How many aircon units need work?', unit: 'units', value: 2 },
        { key: 'has_power', label: 'Does the unit still turn on?', unit: null, value: false },
      ],
      myQuote: { id: 'quote-1', status: 'accepted', quotedPrice: 180000, earliestDate: '2026-10-15', earliestTimeWindow: 'morning' },
    })),
    '/api/v1/bookings/booking-req-1/quotes': ok([quoteFixture({ status: 'accepted' })]),
    '/api/v1/providers/me/commission-preview*': { data: { data: { tier: 'pro', commissionRate: 0.1 } } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderJobDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('How many aircon units need work?')).toBeTruthy();
  expect(screen.getByText('2 units')).toBeTruthy();
  expect(screen.getByText('Does the unit still turn on?')).toBeTruthy();
  expect(screen.getByText('No')).toBeTruthy();
  expect(screen.queryByText('Unit count')).toBeNull();
  expect(screen.queryByText('Has power')).toBeNull();
});
