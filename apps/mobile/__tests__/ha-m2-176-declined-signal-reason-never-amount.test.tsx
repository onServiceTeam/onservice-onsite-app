// HA-M2-176 (D38 Milestone 2, package P5b): a request that came back after
// the customer declined an earlier quote tells providers why, as a short
// label ("The customer declined an earlier quote. Reason: Price too high."),
// and never the declined amount, even when an admin setting makes the
// server send it (earlier prices must not anchor new quotes).
//
// P5b review: the amount check matches the number in any form (2750,
// 2,750, 2.750, P2750, 275000 centavos), not one formatted string, so a
// different rendering of the amount cannot slip through.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { providerRequestFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { RequestInbox } from '@/components/provider/RequestInbox';

it('HA-M2-176: the declined signal shows the reason label and never the declined amount', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 1, page: 1, pageSize: 50, requests: [
      providerRequestFixture({
        round: 2,
        budgetMin: null,
        budgetMax: null,
        budgetUnknown: true,
        // request_show_declined_amount on: the server includes the amount.
        customerDeclines: [{ round: 1, reason: 'too_expensive', amount: 275000 }],
      }),
    ] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><RequestInbox /></QueryClientProvider>);

  expect(await screen.findByText('The customer declined an earlier quote. Reason: Price too high.')).toBeTruthy();
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/2[,.\s]?750/);
  expect(text).not.toContain('275000');
});
