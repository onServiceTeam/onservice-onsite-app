// HA-M2-520 (D38 Milestone 2, package P5a review fix, missing coverage;
// design-provider-realtime section 7): no in-app banner covers the screen
// that already shows its booking. A customer reading Ana's thread for
// booking-7 gets no banner for Ana's new message there, but a message from a
// different pro about the same booking is still news and shows.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockHandlers = new Map<string, Set<(payload: unknown) => void>>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/customer/chat/booking-7',
  useGlobalSearchParams: () => ({ id: 'booking-7', provider: 'provider-ana' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: 'customer-1', role: 'customer' },
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

function serve(payload: unknown): void {
  act(() => { mockHandlers.get('notification:new')?.forEach((handler) => handler(payload)); });
}

it('HA-M2-520: a notice for the booking on screen shows no banner, while another pro on the same booking does', () => {
  render(<QueryClientProvider client={new QueryClient()}><InAppNoticeHost /></QueryClientProvider>);

  serve({
    id: 'notification-1', type: 'new_message', title: 'New message from Ana R.', body: 'Open the conversation to read it.',
    data: { bookingId: 'booking-7', providerUserId: 'provider-ana', conversationId: 'conversation-ana' },
    createdAt: '2026-10-14T02:00:00.000Z',
  });
  expect(screen.queryByText('New message from Ana R.')).toBeNull();

  serve({
    id: 'notification-2', type: 'new_message', title: 'New message from Ben C.', body: 'Open the conversation to read it.',
    data: { bookingId: 'booking-7', providerUserId: 'provider-ben', conversationId: 'conversation-ben' },
    createdAt: '2026-10-14T02:01:00.000Z',
  });
  expect(screen.getByText('New message from Ben C.')).toBeTruthy();
});
