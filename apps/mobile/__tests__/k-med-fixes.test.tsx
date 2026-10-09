// Phase K MED-K05 / K17 and Phase 200 provider dashboard contracts.
//
// These tests render the real status badge and provider dashboard. The
// dashboard fixture deliberately gives the provider a gross service price
// and a different customer total, so the displayed amount can be verified at
// the same boundary where a provider makes job decisions.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn();
const mockGetMyProfile = jest.fn();
const mockGetProviderBookings = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = { user: { id: 'provider-1', firstName: 'Ana', lastName: 'Cruz' } };
    return selector ? selector(state) : state;
  },
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
  getProviderBookings: (...args: unknown[]) => mockGetProviderBookings(...args),
  setAvailability: jest.fn(),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import { StatusBadge } from '../src/components/StatusBadge';
import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';
import { formatPHP } from '../src/utils/currency';

const providerProfile = {
  id: 'provider-1',
  userId: 'user-1',
  businessName: 'Cebu Home Services',
  tier: 'founding',
  status: 'approved',
  bio: 'A local service team.',
  rating: 4.8,
  totalJobs: 12,
  acceptanceRate: 0.9,
  responseTimeMinutes: 20,
  yearsExperience: 5,
  serviceRadiusKm: 15,
  isAvailable: true,
  latitude: null,
  longitude: null,
  city: 'Cebu City',
  province: 'Cebu',
  createdAt: '2026-01-01T00:00:00.000Z',
  services: [],
  schedule: [],
  ratings: { overall: 4.8, totalReviews: 8, quality: null, punctuality: null, professionalism: null, communication: null, value: null },
  portfolio: [],
  certifications: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyProfile.mockResolvedValue(providerProfile);
  mockGetProviderBookings.mockResolvedValue({ bookings: [] });
  mockApiGet.mockResolvedValue({ data: { meta: { unread: 0 } } });
});

describe('Phase K MED-K17 - StatusBadge renders friendly labels for the full booking state set', () => {
  it('MED-K17 - quote and payout states are rendered as user-facing labels', () => {
    const view = render(
      <>
        <StatusBadge status="quoted" />
        <StatusBadge status="payout_ready" />
        <StatusBadge status="paid_out" />
      </>,
    );

    expect(screen.getByLabelText('Status: Quote received')).toBeTruthy();
    expect(screen.getByLabelText('Status: Payout ready')).toBeTruthy();
    expect(screen.getByLabelText('Status: Paid out')).toBeTruthy();
    expect(view.container.textContent).not.toContain('payout_ready');
  });

  it('MED-K17 - all cancellation sources retain the same customer-safe label', () => {
    render(
      <>
        <StatusBadge status="cancelled_by_customer" />
        <StatusBadge status="cancelled_by_provider" />
        <StatusBadge status="cancelled_by_admin" />
      </>,
    );

    expect(screen.getAllByText('Cancelled')).toHaveLength(3);
  });
});

describe('Phase 200 - provider dashboard displays the provider service price', () => {
  it('shows servicePrice rather than the customer total on the active job card', async () => {
    mockGetProviderBookings.mockResolvedValue({ bookings: [{
      id: 'job-1',
      status: 'confirmed',
      serviceName: 'Aircon Cleaning',
      categoryName: 'Aircon',
      scheduledAt: '2099-08-31T09:00:00+08:00',
      address: '1 Test Street',
      barangay: 'Lahug',
      city: 'Cebu City',
      servicePrice: 50_000,
      totalAmount: 60_000,
    }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <ProviderDashboardScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Aircon Cleaning')).toBeTruthy());
    expect(screen.getByText(formatPHP(50_000))).toBeTruthy();
    expect(screen.queryByText(formatPHP(60_000))).toBeNull();
  });
});
