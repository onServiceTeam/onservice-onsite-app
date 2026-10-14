// HA-M2-210 (D38 Milestone 2, package P5a): a voice note in a thread shows
// its length and plays in place, with a pause button while it plays.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage, openConversation } from '@/services/messaging.service';
import { PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1', provider: 'provider-user-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'customer-user-1', role: 'customer' } }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined,
  onSocketStatus: () => () => undefined,
  isSocketConnected: () => true,
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: { players: Array<{ source: unknown; calls: Array<{ op: string }> }>; reset: () => void };
};

beforeEach(() => audio.reset());

it('HA-M2-210: a voice bubble shows its length and plays', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-voice', PROVIDER_USER_ID, 'Voice message (0:12)', '2026-10-14T01:05:00.000Z', {
      messageType: 'voice',
      media: {
        id: 'media-voice-1', kind: 'voice', durationMs: 12000,
        url: '/api/v1/job-media/file/voice-token', expiresAt: '2099-01-01T00:00:00.000Z',
      },
    }),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  const play = await screen.findByRole('button', { name: 'Play voice message' });
  expect(screen.getByLabelText('Voice message, 12 seconds')).toBeTruthy();
  expect(screen.getByText('0:12')).toBeTruthy();

  await act(async () => { fireEvent.click(play); });
  const player = audio.players[0]!;
  expect(String(player.source)).toContain('/api/v1/job-media/file/voice-token');
  expect(player.calls.map((call) => call.op)).toContain('play');
  expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeTruthy();
});
