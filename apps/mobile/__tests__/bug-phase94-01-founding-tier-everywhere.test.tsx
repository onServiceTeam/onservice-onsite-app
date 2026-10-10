import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockSetCategory = jest.fn();
const mockSetSubcategory = jest.fn();
const foundingProvider = {
  id: 'provider-1',
  userId: 'user-1',
  name: 'Cebu Founders Care',
  businessName: 'Cebu Founders Care',
  tier: 'founding',
  bio: 'Early launch service team.',
  rating: 4.9,
  averageRating: 4.9,
  totalJobs: 42,
  totalReviews: 18,
  acceptanceRate: 0.95,
  responseTimeMinutes: 15,
  yearsExperience: 8,
  serviceRadiusKm: 20,
  isAvailable: true,
  latitude: null,
  longitude: null,
  city: 'Cebu City',
  province: 'Cebu',
  createdAt: '2026-01-01T00:00:00.000Z',
  sukiCount: 4,
  ratings: {},
  portfolio: [],
  certifications: [],
  schedule: [],
  services: [],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1', q: 'founders' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: { id: 'user-1', firstName: 'Ana', lastName: 'Cruz', phone: '+639171234567' },
      logout: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector?: (state: unknown) => unknown) => {
    const state = { setCategory: mockSetCategory, setSubcategory: mockSetSubcategory };
    return selector ? selector(state) : state;
  },
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue(foundingProvider),
  setAvailability: jest.fn(),
  getProviderBookings: jest.fn().mockResolvedValue({ bookings: [] }),
  getTierProgression: jest.fn().mockResolvedValue({
    currentTier: 'founding',
    currentCommission: 10,
    currentCommissionSource: 'provider_contract',
    currentCommissionRateVersionId: 'provider-contract-v3',
    progressionTrack: 'founding',
    promotionMode: 'admin_review',
    nextTier: null,
    progress: { totalJobs: 42, rating: 4.9, hasCertification: false, openDisputeCount: 0 },
    requirements: null,
    allTiers: [
      { tier: 'founding', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 10, benefits: [] },
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
    ],
    progressionTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
    ],
  }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue(foundingProvider),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null }),
}));
jest.mock('@/services/suki.service', () => ({
  getMemberships: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockImplementation(async (url: string) => {
      if (url === '/api/v1/catalog/search') {
        return { data: { data: { services: [], providers: [{
          id: 'provider-1',
          userId: 'user-1',
          businessName: 'Cebu Founders Care',
          tier: 'founding',
          averageRating: 4.9,
          totalReviews: 18,
          city: 'Cebu City',
          avatarUrl: null,
        }] } } };
      }
      if (url === '/api/v1/notifications') return { data: { meta: { unread: 0 } } };
      return { data: { data: [] } };
    }),
  },
}));

import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';
import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';
import TierProgressionScreen from '../app/provider/tier-progression';
import CustomerProviderProfileScreen from '../app/customer/provider/[id]';
import SearchScreen from '../app/customer/search';

const renderWithClient = (element: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
};

describe('BUG-PHASE94-01 - founding tier is visible across provider and customer surfaces', () => {
  it('renders the founding label on the provider dashboard, profile, and tier workspace', async () => {
    const dashboard = renderWithClient(<ProviderDashboardScreen />);
    expect(await screen.findByText('Founding')).toBeTruthy();
    dashboard.unmount();

    const profile = renderWithClient(<ProviderProfileScreen />);
    expect(await screen.findByText('Founding')).toBeTruthy();
    profile.unmount();

    renderWithClient(<TierProgressionScreen />);
    expect(await screen.findByText('Founding sits beside the standard ladder')).toBeTruthy();
    expect(screen.getByText('10% default commission')).toBeTruthy();
  });

  it('renders the founding label on the customer provider detail and search result', async () => {
    const detail = renderWithClient(<CustomerProviderProfileScreen />);
    expect(await screen.findByText('Founding Provider')).toBeTruthy();
    detail.unmount();

    renderWithClient(<SearchScreen />);
    expect(await screen.findByText('Cebu Founders Care')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Founding')).toBeTruthy());
  });
});
