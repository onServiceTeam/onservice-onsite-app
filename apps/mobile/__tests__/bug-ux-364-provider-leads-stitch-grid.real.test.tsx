import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) }),
  // D38 Milestone 2 (P5b): the old leads route shows the Requests screen, which reads ?tab.
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        success: true,
        total: 1,
        requests: [
          {
            id: 'request-1',
            categoryName: 'Aircon Services',
            description: 'Split-type aircon needs deep cleaning',
            urgency: 'within_3_days',
            budgetMin: 150000,
            budgetMax: 250000,
            jobPhotos: [],
            jobVideoUrl: null,
            barangay: 'Lahug',
            city: 'Cebu City',
            distanceKm: 4.2,
            createdAt: '2026-08-25T06:00:00.000Z',
          },
        ],
      },
    }),
  },
}));
// D38 Milestone 2 (P5b): the inbox listens through subscribeSocketEvent.
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import ProviderLeadsScreen from '../app/provider/leads';

// D38 Milestone 2 (P5b): the lifecycle text is now config-driven and true.
// The old line "A request stays open to eligible providers until a customer
// accepts a quote" stopped being true when the first quote takes the request
// (request_max_open_quotes = 1, the default).
it('Bug UX-364 — provider job requests use a bounded desktop grid and explain the quote lifecycle', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  const { container } = render(
    <QueryClientProvider client={client}>
      <ProviderLeadsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/The first pro to send a quote gets the request. The customer then accepts or declines it./)).toBeTruthy();
  expect(screen.queryByText(/stays open to eligible providers until a customer accepts a quote/i)).toBeNull();
  expect(container.querySelector('flatlist')?.getAttribute('accessibilitylabel')).toBe('Tablet and desktop provider job request grid');
  fireEvent.click(screen.getByLabelText('Open Aircon Services job request and prepare a quote'));
  expect(mockPush).toHaveBeenCalledWith('/provider/job/request-1/quote');
});
