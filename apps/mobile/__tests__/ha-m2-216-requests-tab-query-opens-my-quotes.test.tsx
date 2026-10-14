// HA-M2-216 (D38 Milestone 2, package P5b): /(provider-tabs)/requests?tab=quotes
// (Routes.PROVIDER.MY_QUOTES, where the "quote declined" and "customer chose
// another pro" notification taps go) opens the Requests tab on My quotes;
// without the parameter it opens on New requests.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { myQuoteFixture, ok, providerRequestFixture, routeGets } from '../test-support/request-fixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import ProviderRequestsTab from '../app/(provider-tabs)/requests';

function renderTab(): ReturnType<typeof render> {
  routeGets({
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 1, page: 1, pageSize: 50, requests: [providerRequestFixture({ serviceName: 'Sink unclogging' })] } },
    '/api/v1/providers/me/quotes': ok([myQuoteFixture({ serviceName: 'Aircon repair', displayStatus: 'not_selected' })], { meta: { page: 1, pageSize: 50, total: 1 } }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ProviderRequestsTab /></QueryClientProvider>);
}

it('HA-M2-216: ?tab=quotes opens My quotes, and no parameter opens New requests', async () => {
  mockParams = { tab: 'quotes' };
  const quotes = renderTab();
  expect(await screen.findByRole('button', { name: 'Aircon repair, Customer chose another pro' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'My quotes' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('Sink unclogging')).toBeNull();
  quotes.unmount();

  mockParams = {};
  renderTab();
  expect(await screen.findByText('Sink unclogging')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'New requests' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('Customer chose another pro')).toBeNull();
});
