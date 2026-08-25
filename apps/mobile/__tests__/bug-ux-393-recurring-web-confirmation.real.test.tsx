import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPost = jest.fn().mockResolvedValue({ data: { data: {} } });

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }), useLocalSearchParams: () => ({ id: 'recurring-1' }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: {
      id: 'recurring-1', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: 'Provider One',
      frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active', servicePrice: 50000,
      serviceFee: 5000, totalAmount: 55000, nextScheduledDate: '2026-09-01', address: '1 Test Street',
      barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', totalCompleted: 2, totalSkipped: 0,
      cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
    } } }),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('Bug UX-393 — pausing and skipping recurring work use an in-app decision that states the exact impact', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Pause recurring booking' }));
  let dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('No new bookings will be created until you resume');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep Schedule' }));

  fireEvent.click(screen.getByRole('button', { name: 'Skip next recurring visit' }));
  dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('Later visits stay scheduled');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Skip This Visit' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/recurring/recurring-1/skip', { skipDate: '2026-09-01' }));
});
