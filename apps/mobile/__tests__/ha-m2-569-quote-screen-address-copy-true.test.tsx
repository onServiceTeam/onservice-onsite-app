// HA-M2-569 (D38 Milestone 2, package P5b, review fix): the request screen
// tells the pro when the street address is shared, truthfully. Accepting a
// quote assigns the pro, and the booking (with its full address) opens to
// them before any payment, so "shared only after the customer books and
// pays" was a privacy promise the app does not keep. Hiding the address
// until payment is Ken's open question 16; until he decides, the copy says
// what really happens.
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

it('HA-M2-569: the request screen says the street address is shared once the customer accepts the quote, not after payment', async () => {
  quoteScreenGets();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('The street address is shared once the customer accepts your quote.')).toBeTruthy();
  expect(container.textContent).not.toMatch(/books and pays/);
});
