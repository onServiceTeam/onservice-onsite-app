// R-NOT-01 (repair list, 2026-10-14): when the customer pays for a job a pro
// already has, the server now stores a "customer_paid" notice for that pro.
// While the pro's app is open, the notice shows as the in-app banner (Android
// push is not configured yet, so this banner is how an open app sees it), and
// tapping it opens that job.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockHandlers = new Map<string, Set<(payload: unknown) => void>>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: 'provider-user-1', role: 'provider' },
  }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    if (!mockHandlers.has(event)) mockHandlers.set(event, new Set());
    mockHandlers.get(event)!.add(handler);
    return () => { mockHandlers.get(event)?.delete(handler); };
  },
  isSocketConnected: () => true,
  onSocketStatus: () => () => undefined,
}));

import { InAppNoticeHost } from '@/components/InAppNoticeHost';

it('Bug R-NOT-01-H — an open provider app shows the customer-paid notice as a banner that opens the job', () => {
  render(<QueryClientProvider client={new QueryClient()}><InAppNoticeHost /></QueryClientProvider>);

  act(() => {
    mockHandlers.get('notification:new')?.forEach((handler) => handler({
      id: 'notification-9',
      type: 'customer_paid',
      title: 'Customer paid',
      body: 'Ana paid for Aircon repair. The job is confirmed for Fri, Oct 16, morning (8 AM to 12 PM).',
      data: { bookingId: 'booking-42' },
      createdAt: '2026-10-14T09:00:00.000Z',
    }));
  });

  const banner = screen.getByRole('button', {
    name: 'Customer paid. Ana paid for Aircon repair. The job is confirmed for Fri, Oct 16, morning (8 AM to 12 PM).',
  });
  fireEvent.click(banner);
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-42');
});
