// Round-3 audit (2026-06-10) — provider notifications "Mark all read" had an
// onSuccess invalidation but NO onError handler: when the API call failed the
// tap produced no feedback at all. The mutation now surfaces an error toast.
// Real render test: mount the screen with the service mocked to reject, tap
// the real button, assert the toast fires.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

jest.mock('@/lib/toast', () => ({
  showToast: jest.fn(),
  showRetryableToast: jest.fn(),
}));

import ProviderNotificationsScreen from '../../app/provider/notifications';
import * as notificationService from '@/services/notification.service';
import { showToast } from '@/lib/toast';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const { container } = render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ProviderNotificationsScreen),
    ),
  );
  return { container };
}

const unreadNotification = {
  id: 'n1',
  type: 'job_assigned',
  title: 'New job assigned',
  body: 'You have a new job.',
  isRead: false,
  createdAt: new Date().toISOString(),
  data: {},
};

describe('provider notifications — Mark all read error feedback', () => {
  it('shows an error toast when the mark-all-read call fails', async () => {
    (notificationService.getNotifications as jest.Mock).mockResolvedValue({
      notifications: [unreadNotification],
      unread: 1,
    });
    (notificationService.markAllNotificationsRead as jest.Mock).mockRejectedValue(
      new Error('network down'),
    );

    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('Mark all read');
    });

    const markAll = Array.from(container.querySelectorAll('*')).find(
      (el) => el.textContent === 'Mark all read',
    );
    expect(markAll).toBeTruthy();
    fireEvent.click(markAll!.closest('button') ?? markAll!);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('network down'), 'error');
    });
  });
});
