import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => ({ on: jest.fn() }), getSocket: () => null,
  joinConversation: jest.fn(), leaveConversation: jest.fn(), emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  getConversations: jest.fn().mockResolvedValue([{ id: 'conversation-1', bookingId: 'booking-1' }]),
  createConversation: jest.fn(), getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
  sendMessage: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', providerName: 'Cebu Prime Services' }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-227 — customer chat explains its support evidence value without advertising a deferred service guarantee', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(await screen.findByText(/On-app chat stays attached to the booking/i)).toBeTruthy();
  expect(screen.getByText(/support can review the service record and any dispute evidence/i)).toBeTruthy();
  expect(screen.queryByText(/service guarantee/i)).toBeNull();
});
