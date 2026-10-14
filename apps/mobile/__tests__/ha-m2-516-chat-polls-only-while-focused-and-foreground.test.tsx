// HA-M2-516 (D38 Milestone 2, package P5a review fix, missing coverage): an
// open chat asks for new messages only while it is the screen in front and
// the app is in the foreground. The API allows 100 requests per user per 15
// minutes; a chat left behind another screen, or an app in the background,
// that kept polling every 20 s would lock the account out of every screen.
// Polling stops on blur and on background, and resumes on return.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage, openConversation } from '@/services/messaging.service';
import { CUSTOMER_ID, PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

const mockFocus = { focused: true, listeners: new Set<(focused: boolean) => void>() };

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactInMock = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'booking-1', provider: 'provider-user-1' }),
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
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'customer-user-1', role: 'customer' } }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined,
  onSocketStatus: () => () => undefined,
  isSocketConnected: () => false,
  joinConversation: jest.fn(), leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(), emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn(), getConversation: jest.fn(), getMessagesPage: jest.fn(), sendChatMessage: jest.fn(),
  getInbox: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'quoted', serviceName: 'Aircon repair' }),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

const appState = AppState as unknown as { __emit: (state: string) => void };

function setFocused(focused: boolean): void {
  mockFocus.focused = focused;
  act(() => { mockFocus.listeners.forEach((listener) => listener(focused)); });
}

afterEach(() => {
  jest.useRealTimers();
  mockFocus.focused = true;
  appState.__emit('active');
});

it('HA-M2-516: chat polling stops when the chat loses focus or the app goes to the background, and resumes on return', async () => {
  jest.useFakeTimers();
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-1', CUSTOMER_ID, 'Can you bring a ladder?', '2026-10-14T01:00:00.000Z'),
    messageFixture('message-2', PROVIDER_USER_ID, 'Yes, a 6 ft one.', '2026-10-14T01:01:00.000Z'),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);
  await act(async () => { await jest.advanceTimersByTimeAsync(50); });
  expect(screen.getByText('Yes, a 6 ft one.')).toBeTruthy();
  const calls = (): number => jest.mocked(getMessagesPage).mock.calls.length;
  expect(calls()).toBe(1);

  // On screen, connection down: one poll per 20 s.
  await act(async () => { await jest.advanceTimersByTimeAsync(20_100); });
  expect(calls()).toBe(2);

  // Another screen is in front: no polls.
  setFocused(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(calls()).toBe(2);

  // Back on the chat: polling resumes.
  setFocused(true);
  await act(async () => { await jest.advanceTimersByTimeAsync(20_100); });
  expect(calls()).toBe(3);

  // App in the background: no polls.
  act(() => { appState.__emit('background'); });
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(calls()).toBe(3);

  // Foreground again: polling resumes.
  act(() => { appState.__emit('active'); });
  await act(async () => { await jest.advanceTimersByTimeAsync(20_100); });
  expect(calls()).toBe(4);
});
