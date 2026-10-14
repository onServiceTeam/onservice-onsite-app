// HA-M2-165 (D38 Milestone 2, package P5a): while the app is open, a stored
// notice that arrives over the live connection (`notification:new`) shows as
// a banner with the notice's own title and text, and tapping it opens the
// same screen as tapping the phone notification. Android push is still off,
// so this banner is how a customer sees a new quote in the open app.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockHandlers = new Map<string, Set<(payload: unknown) => void>>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/home',
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

function serve(event: string, payload: unknown): void {
  act(() => { mockHandlers.get(event)?.forEach((handler) => handler(payload)); });
}

it('HA-M2-165: a new-quote notice shows as a banner and its tap opens the quotes for that request', () => {
  render(<QueryClientProvider client={new QueryClient()}><InAppNoticeHost /></QueryClientProvider>);
  expect(screen.queryByRole('button', { name: /Ana R\. quoted/ })).toBeNull();

  serve('notification:new', {
    id: 'notification-1',
    type: 'new_quote',
    title: 'New quote',
    body: 'Ana R. quoted ₱1,500.00 for Aircon repair. Tap to review.',
    data: { bookingId: 'booking-7', quoteId: 'quote-3' },
    createdAt: '2026-10-14T02:00:00.000Z',
  });

  const banner = screen.getByRole('button', { name: 'New quote. Ana R. quoted ₱1,500.00 for Aircon repair. Tap to review.' });
  fireEvent.click(banner);

  expect(mockPush).toHaveBeenCalledWith('/customer/booking/quotes?bookingId=booking-7');
  expect(screen.queryByText('New quote')).toBeNull();
});
