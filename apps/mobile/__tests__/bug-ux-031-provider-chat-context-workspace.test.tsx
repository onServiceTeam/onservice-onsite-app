import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => ({ on: jest.fn() }),
  getSocket: () => null,
  joinConversation: jest.fn(),
  leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(),
  emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  getConversations: jest.fn().mockResolvedValue([{ id: 'conversation-1', bookingId: 'booking-1' }]),
  createConversation: jest.fn(),
  getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
  sendMessage: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined),
  reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'in_progress',
    serviceName: 'Aircon Cleaning',
    customerName: 'Paolo Garcia',
    scheduledAt: '2026-08-24T01:00:00.000Z',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
  }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

it('Bug UX-031 — provider chat keeps customer and job context beside the conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Provider conversation workspace');
  const context = await screen.findByLabelText('Job conversation context');
  expect(workspace.contains(context)).toBe(true);
  expect(context.textContent).toContain('Paolo Garcia');
  expect(screen.getByText('Open job details')).toBeTruthy();
});
