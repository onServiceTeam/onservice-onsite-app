import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockMarkAll = jest.fn().mockRejectedValue(new Error('network down'));
const mockToast = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({
    notifications: [{ id: 'n1', type: 'booking_confirmed', title: 'Booking confirmed', body: 'Ready', data: { bookingId: 'b1' }, isRead: false, createdAt: '2026-08-24T00:00:00.000Z' }],
    unread: 1, total: 1,
  }),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAll(...args),
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

import CustomerNotificationsScreen from '../app/customer/notifications';

it('Bug UX-138 — customer mark-all-read failure reports the error instead of silently leaving unread state behind', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerNotificationsScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Mark all read'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('network down', 'error'));
});
