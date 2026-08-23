import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomerNotificationsScreen from '../app/customer/notifications';
import ProviderNotificationsScreen from '../app/provider/notifications';

const mockPush = jest.fn();
let mockNotificationType = 'rating_received';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockImplementation(async () => ({
    notifications: [
      {
        id: `notification-${mockNotificationType}`,
        type: mockNotificationType,
        title: `Open ${mockNotificationType}`,
        body: 'Open the relevant workspace',
        data: {},
        isRead: true,
        createdAt: '2026-08-23T00:00:00.000Z',
      },
    ],
    total: 1,
    unread: 0,
  })),
  markNotificationRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn().mockResolvedValue(0),
}));

function renderNotifications(Screen: React.ComponentType): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>,
  );
}

describe('notification destination routing', () => {
  afterEach(() => {
    cleanup();
    mockPush.mockClear();
  });

  it('BUG-PHASE125-01 — opens the correct customer and provider workspace from each rendered notification type', async () => {
    const cases: Array<{
      type: string;
      screen: React.ComponentType;
      expectedRoute: string;
    }> = [
      {
        type: 'rating_received',
        screen: CustomerNotificationsScreen,
        expectedRoute: '/(tabs)/bookings',
      },
      {
        type: 'rating_received',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/provider/reviews',
      },
      {
        type: 'payment',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/(provider-tabs)/earnings',
      },
      {
        type: 'payment_released',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/(provider-tabs)/earnings',
      },
      {
        type: 'tier_upgrade',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/provider/tier-progression',
      },
      {
        type: 'provider_tier_changed',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/provider/tier-progression',
      },
      {
        type: 'nbi_expiring',
        screen: ProviderNotificationsScreen,
        expectedRoute: '/provider/account-management',
      },
    ];

    for (const testCase of cases) {
      mockNotificationType = testCase.type;
      const screen = renderNotifications(testCase.screen);

      fireEvent.click(await screen.findByText(`Open ${testCase.type}`));
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(testCase.expectedRoute);
      });

      cleanup();
      mockPush.mockClear();
    }
  });
});
