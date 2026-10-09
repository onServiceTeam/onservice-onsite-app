import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getNotifications } from '@/services/notification.service';
import CustomerInbox from '../app/customer/notifications';
import ProviderInbox from '../app/provider/notifications';

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn(), markNotificationRead: jest.fn(), markAllNotificationsRead: jest.fn(),
}));

it('Bug UX-1342 — both inboxes render the full admission reason and next steps instead of an unreadable two-line preview', async () => {
  for (const Screen of [CustomerInbox, ProviderInbox]) {
    const notices = ['provider_approved', 'provider_rejected', 'new_message'].map((type, index) => ({
      id: `notice-${index}`, type, title: type,
      body: `${type}: This is a long decision explanation. Important next steps at the end must remain visible to the applicant, including how to reach support and review their services and availability.`,
      data: null, isRead: true, createdAt: '2026-09-06T00:00:00Z',
    }));
    jest.mocked(getNotifications).mockResolvedValue({ notifications: notices, total: 3, unread: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
    for (const notice of notices) {
      const body = await screen.findByText(notice.body);
      expect(body.getAttribute('numberoflines')).toBe(notice.type === 'new_message' ? '2' : null);
    }
    view.unmount(); client.clear();
  }
});
