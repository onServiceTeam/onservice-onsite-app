// HA-M2-166 (D38 Milestone 2, package P5a): the in-app banner vibrates only
// for the four "act now" notices: a new request, a reopened request, a new
// quote and an accepted quote. Other request, quote and message notices show
// a banner without vibrating.
import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const mockHandlers = new Map<string, Set<(payload: unknown) => void>>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard',
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: 'provider-1', role: 'provider' },
  }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    if (!mockHandlers.has(event)) mockHandlers.set(event, new Set());
    mockHandlers.get(event)!.add(handler);
    return () => { mockHandlers.get(event)?.delete(handler); };
  },
  isSocketConnected: () => true,
  onSocketStatus: () => () => undefined,
}));

import { InAppNoticeHost } from '@/components/InAppNoticeHost';

function notice(type: string, index: number): void {
  act(() => {
    mockHandlers.get('notification:new')?.forEach((handler) => handler({
      id: `notification-${index}`,
      type,
      title: 'Notice',
      body: 'Body',
      data: { bookingId: `booking-${index}` },
      createdAt: '2026-10-14T02:00:00.000Z',
    }));
  });
}

it('HA-M2-166: only new_job_request, job_request_reopened, new_quote and quote_accepted vibrate', () => {
  render(<QueryClientProvider client={new QueryClient()}><InAppNoticeHost /></QueryClientProvider>);
  const vibrate = jest.mocked(Haptics.notificationAsync);
  vibrate.mockClear();

  ['quote_declined', 'quote_not_selected', 'new_message', 'request_still_looking', 'job_request_cancelled']
    .forEach((type, index) => notice(type, index));
  expect(vibrate).not.toHaveBeenCalled();

  ['new_job_request', 'job_request_reopened', 'new_quote', 'quote_accepted']
    .forEach((type, index) => notice(type, 10 + index));
  expect(vibrate).toHaveBeenCalledTimes(4);
  expect(vibrate).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
});
