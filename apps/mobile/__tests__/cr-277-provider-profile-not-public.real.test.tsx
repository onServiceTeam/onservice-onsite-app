// Customer review 2026-10-18, Service Provider profile privacy fix
// (discovery-support-4, app side): the server answers 404 for a profile that
// is not public. The screen says the profile was not found, instead of
// blaming the customer's connection and offering a retry that cannot work.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/services/api';

const mockGetProviderProfile = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-pending' }),
}));
jest.mock('@/hooks/useRequestFirstBooking', () => ({ useRequestFirstBooking: () => true }));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: (...args: unknown[]) => mockGetProviderProfile(...args),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null, total: 0 }),
}));
jest.mock('@/services/suki.service', () => ({ getMemberships: jest.fn().mockResolvedValue([]) }));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug CR-277 — a Service Provider profile that is not public shows "not found", with no retry', async () => {
  mockGetProviderProfile.mockRejectedValue(
    new ApiError(404, { success: false, error: { message: 'Provider not found.', code: 'not_found' } } as never, 'Not found'),
  );
  // The screen's own retry rule is used: queries may retry, a 404 must not.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByText('Provider not found')).toBeTruthy();
  expect(screen.queryByText(/check your connection/i)).toBeNull();
  expect(mockGetProviderProfile).toHaveBeenCalledTimes(1);
});
