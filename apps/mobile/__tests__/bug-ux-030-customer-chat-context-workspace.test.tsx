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
    status: 'provider_en_route',
    serviceName: 'Aircon Cleaning',
    providerName: 'Cebu Prime Services',
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

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-030 — customer chat keeps booking status and actions visible beside the conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Customer conversation workspace');
  const context = await screen.findByLabelText('Booking conversation context');
  expect(workspace.contains(context)).toBe(true);
  expect(context.textContent).toContain('Aircon Cleaning');
  expect(screen.getByText('View booking details')).toBeTruthy();
  expect(screen.getByText('Open booking tracker')).toBeTruthy();
});
