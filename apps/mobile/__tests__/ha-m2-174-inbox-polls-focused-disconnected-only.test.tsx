// HA-M2-174 (D38 Milestone 2, package P5b): the provider's Requests inbox
// re-reads the list every requestProviderPollSeconds (30 by default) only
// while it is the screen in front and the live connection is down. While
// connected, the server's events do the work, and a screen behind another
// one does not poll at all (the API allows 100 requests per user per 15
// minutes). Coming back in front re-reads once if the list is stale.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { providerRequestFixture, routeGets } from '../test-support/request-fixtures';
import { socketMock } from '../test-support/socket-mock';

const mockFocus = { focused: true, listeners: new Set<(focused: boolean) => void>() };

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactInMock = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({}),
    // Like expo-router: run the effect while the screen is focused, clean it up on blur.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [focused, setFocused] = ReactInMock.useState(mockFocus.focused);
      ReactInMock.useEffect(() => {
        const listener = (next: boolean): void => setFocused(next);
        mockFocus.listeners.add(listener);
        return () => { mockFocus.listeners.delete(listener); };
      }, []);
      ReactInMock.useEffect(() => (focused ? effect() : undefined), [focused, effect]);
    },
  };
});
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { RequestInbox } from '@/components/provider/RequestInbox';

const LIST_URL = '/api/v1/providers/me/job-requests';
const listCalls = (): number => jest.mocked(api.get).mock.calls.filter((call) => call[0] === LIST_URL).length;

function setFocused(focused: boolean): void {
  mockFocus.focused = focused;
  act(() => { mockFocus.listeners.forEach((listener) => listener(focused)); });
}

afterEach(() => {
  jest.useRealTimers();
  mockFocus.focused = true;
  socketMock.reset();
});

it('HA-M2-174: the inbox polls every 30 s only while focused and disconnected, and stops when connected or out of focus', async () => {
  jest.useFakeTimers();
  routeGets({ [LIST_URL]: { data: { success: true, requests: [providerRequestFixture()], total: 1, page: 1, pageSize: 50 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestInbox /></QueryClientProvider>);
  await act(async () => { await jest.advanceTimersByTimeAsync(50); });
  expect(screen.getByText('Aircon repair')).toBeTruthy();
  const start = listCalls();
  expect(start).toBe(1);

  // In front, connection down: one read per 30 s.
  await act(async () => { await jest.advanceTimersByTimeAsync(30_100); });
  expect(listCalls()).toBe(2);

  // Connected: events do the work, no polling.
  act(() => { socketMock.setConnected(true); });
  await act(async () => { await jest.advanceTimersByTimeAsync(150_000); });
  expect(listCalls()).toBe(2);

  // Connection lost again: polling resumes.
  act(() => { socketMock.setConnected(false); });
  await act(async () => { await jest.advanceTimersByTimeAsync(30_100); });
  expect(listCalls()).toBe(3);

  // Another screen in front: no polling.
  setFocused(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(90_000); });
  expect(listCalls()).toBe(3);

  // Back in front: one read at once (the list is stale), then polling resumes.
  setFocused(true);
  await act(async () => { await jest.advanceTimersByTimeAsync(50); });
  expect(listCalls()).toBe(4);
  await act(async () => { await jest.advanceTimersByTimeAsync(30_100); });
  expect(listCalls()).toBe(5);
});
