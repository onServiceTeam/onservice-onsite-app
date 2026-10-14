// HA-M2-173 (D38 Milestone 2, package P5b): the provider tab bar has a
// Requests tab whose badge is the number of open requests this provider has
// not opened yet (GET /providers/me/job-requests/summary unseenCount), with
// no badge at zero and "9+" above nine. Five tabs in all.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { ok, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react') as typeof import('react');
  // Each tab is shown with its title and badge, as the tab bar would.
  const Screen = ({ name, options }: { name: string; options?: { title?: string; tabBarBadge?: string | number } }) =>
    ReactLocal.createElement('rn-view', {
      'aria-label': `Tab ${options?.title ?? name}`,
      'data-badge': options?.tabBarBadge === undefined ? 'none' : String(options.tabBarBadge),
    });
  const Tabs = Object.assign(
    ({ children }: { children?: React.ReactNode }) => ReactLocal.createElement('rn-view', { 'aria-label': 'Tab navigator' }, children),
    { Screen },
  );
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => ReactLocal.createElement('rn-view', { 'aria-label': `Redirect to ${href}` }),
    usePathname: () => '/dashboard',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  };
});
jest.mock('@/stores/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'provider-user-1', role: 'provider', firstName: 'Roberto' } };
  const useAuthStore = (selector?: (s: typeof state) => unknown): unknown => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('@/components/provider/NewJobModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import ProviderTabLayout from '../app/(provider-tabs)/_layout';

const SUMMARY_URL = '/api/v1/providers/me/job-requests/summary';

async function badgeFor(unseenCount: number): Promise<string | null> {
  routeGets({ [SUMMARY_URL]: ok({ openCount: unseenCount + 2, unseenCount, quotesWaitingCount: 0, isAvailable: true }) });
  const summaryCalls = (): number => jest.mocked(api.get).mock.calls.filter((call) => call[0] === SUMMARY_URL).length;
  const before = summaryCalls();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ProviderTabLayout /></QueryClientProvider>);
  await waitFor(() => expect(summaryCalls()).toBe(before + 1));
  await waitFor(() => expect(client.getQueryState(['provider-request-summary'])?.status).toBe('success'));
  const badge = screen.getByLabelText('Tab Requests').getAttribute('data-badge');
  view.unmount();
  return badge;
}

it('HA-M2-173: the Requests tab badge shows the unseen request count (none at zero, 9+ above nine)', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  routeGets({ [SUMMARY_URL]: ok({ openCount: 0, unseenCount: 0, quotesWaitingCount: 0, isAvailable: true }) });
  const view = render(<QueryClientProvider client={client}><ProviderTabLayout /></QueryClientProvider>);
  expect(screen.getAllByLabelText(/^Tab [A-Z]/).map((tab) => tab.getAttribute('aria-label')))
    .toEqual(['Tab Dashboard', 'Tab Requests', 'Tab Jobs', 'Tab Earnings', 'Tab Profile']);
  view.unmount();

  expect(await badgeFor(3)).toBe('3');
  expect(await badgeFor(0)).toBe('none');
  expect(await badgeFor(12)).toBe('9+');
});
