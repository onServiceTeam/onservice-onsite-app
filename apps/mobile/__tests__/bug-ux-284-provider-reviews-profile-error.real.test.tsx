import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockRejectedValue(new Error('profile unavailable')),
}));

import ProviderReviewsScreen from '../app/provider/reviews';

it('Bug UX-284 — reviews fail closed when the provider identity cannot load instead of claiming there are no reviews', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderReviewsScreen /></QueryClientProvider>);

  expect(await screen.findByText(/reviews cannot be identified safely/i)).toBeTruthy();
  expect(screen.queryByText('No reviews yet')).toBeNull();
});
