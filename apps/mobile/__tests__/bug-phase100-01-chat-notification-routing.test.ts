import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomerNotificationsScreen from '../app/customer/notifications';
import ProviderNotificationsScreen from '../app/provider/notifications';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({
    notifications: [
      {
        id: 'notification-1',
        type: 'new_message',
        title: 'New chat message',
        body: 'Open the conversation',
        data: { bookingId: 'booking with spaces' },
        isRead: true,
        createdAt: '2026-08-23T00:00:00.000Z',
      },
    ],
    total: 1,
    unread: 0,
  }),
  markNotificationRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn().mockResolvedValue(0),
}));

function renderNotifications(Screen: React.ComponentType): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(Screen),
    ),
  );
}

describe('chat notification routing', () => {
  afterEach(() => {
    cleanup();
    mockPush.mockClear();
  });

  it('BUG-PHASE100-01 — opens the direct chat thread for customer and provider notifications', async () => {
    const customer = renderNotifications(CustomerNotificationsScreen);
    fireEvent.click(await customer.findByText('New chat message'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/customer/chat/booking%20with%20spaces');
    });

    cleanup();
    mockPush.mockClear();

    const provider = renderNotifications(ProviderNotificationsScreen);
    fireEvent.click(await provider.findByText('New chat message'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/provider/chat/booking%20with%20spaces');
    });
  });
});
