// HA-M2-571 (D38 Milestone 2, local visual check 2026-10-14): the pro's
// quote form labels the total as the price the customer sees, not "customer
// pays this plus the service fee". The customer service fee is 0 today (Ken,
// 2026-06-28), so the old label told pros the customer pays more than the
// quote, which is not true.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-571: the quote form total is labelled as the price the customer sees, with no service fee promise', async () => {
  quoteScreenGets();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('Your quote (the price the customer sees)')).toBeTruthy();
  expect(container.textContent).not.toMatch(/plus the service fee/i);
});
