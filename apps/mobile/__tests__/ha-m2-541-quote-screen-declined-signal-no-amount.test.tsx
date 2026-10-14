// HA-M2-541 (D38 Milestone 2, package P5b): on the request screen, a request
// the customer reopened after declining shows "The customer declined an
// earlier quote. Reason: ..." with the reason label only, never the declined
// amount (even when the server sends it) and never the customer's note
// (the server never sends it).
//
// P5b review: the amount checks match the numbers in any form (2750, 2,750,
// P2750, 275000 centavos; 1990, 1,990, 199000), not one formatted string.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { providerRequestFixture, quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-541: the request screen shows the decline reason label and no declined amount', async () => {
  quoteScreenGets(providerRequestFixture({
    round: 3,
    customerDeclines: [
      { round: 1, reason: 'too_expensive', amount: 275000 },
      { round: 2, reason: 'timing', amount: 199000 },
    ],
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('The customer declined an earlier quote. Reason: Timing did not work.')).toBeTruthy();
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/2[,.\s]?750/);
  expect(text).not.toMatch(/1[,.\s]?990/);
  expect(text).not.toContain('275000');
  expect(text).not.toContain('199000');
});
