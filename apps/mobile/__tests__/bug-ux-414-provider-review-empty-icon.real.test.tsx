import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1024,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({ id: 'provider-1' }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        success: true,
        data: [],
        aggregate: null,
        pagination: { total: 0, page: 1, pageSize: 15, totalPages: 0 },
      },
    }),
    post: jest.fn(),
  },
}));

import ProviderReviewsScreen from '../app/provider/reviews';

it('Bug UX-414 — provider review empty state uses catalog iconography instead of a text emoji', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ProviderReviewsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('No reviews yet')).toBeTruthy();
  expect(container.textContent).not.toContain('⭐');
});
