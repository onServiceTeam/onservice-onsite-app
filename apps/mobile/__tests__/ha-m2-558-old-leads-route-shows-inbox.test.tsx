// HA-M2-558 (D38 Milestone 2, package P5b): the old /provider/leads link
// (the desktop web menu, older push notifications, bookmarks) still works:
// it shows the same Requests screen, with a back button on a phone because
// it opens on top of the tabs.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { providerRequestFixture, routeGets } from '../test-support/request-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import ProviderLeadsScreen from '../app/provider/leads';

it('HA-M2-558: /provider/leads shows the Requests inbox with a back button', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 1, page: 1, pageSize: 50, requests: [providerRequestFixture({ serviceName: 'Sink unclogging' })] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderLeadsScreen /></QueryClientProvider>);

  expect(screen.getByText('Requests')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Open Sink unclogging job request and prepare a quote' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalled();
});
