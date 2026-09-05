import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getNotifications, markNotificationRead } from '@/services/notification.service';
import { resolveNotificationRoute } from '@/utils/notification-navigation';
import { Routes } from '@/config/navigation';
import CustomerInbox from '../app/customer/notifications';
import ProviderInbox from '../app/provider/notifications';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn(), markNotificationRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn(),
}));

it('Bug UX-1341 — admission inbox taps open owned application review or the approved workspace, not a public profile or deletion settings', async () => {
  for (const [Screen, role, type, expected] of [
    [CustomerInbox, 'customer', 'provider_rejected', Routes.PROVIDER_ONBOARDING.REVIEW_PENDING],
    [CustomerInbox, 'customer', 'provider_approved', Routes.PROVIDER_ONBOARDING.REVIEW_PENDING],
    [ProviderInbox, 'provider', 'provider_approved', Routes.PROVIDER_TABS.DASHBOARD],
  ] as const) {
    const notification = { id: 'synthetic-notice', type, title: 'Application decision',
      body: 'Review your application decision and next steps.', data: { providerId: 'synthetic-provider' },
      isRead: false, createdAt: '2026-09-06T00:00:00Z' };
    jest.mocked(getNotifications).mockResolvedValue({ notifications: [notification], total: 1, unread: 1 });
    mockPush.mockClear(); jest.mocked(markNotificationRead).mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
    fireEvent.click(await screen.findByText(notification.title));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expected));
    expect(markNotificationRead).toHaveBeenCalledWith(notification.id);
    // Push taps use this same resolver. Unrelated payload IDs do not identify
    // the applicant or override the admission destination.
    expect(resolveNotificationRoute(type, { bookingId: 'unrelated', providerId: 'unrelated' }, role)).toBe(expected);
    view.unmount(); client.clear();
  }
  expect(resolveNotificationRoute('provider_assigned', { providerId: 'public-provider' }, 'customer')).toBe('/customer/provider/public-provider');
});
