import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPost = jest.fn().mockRejectedValue(new Error('cancellation unavailable'));
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '91491491-4914-4914-8914-914914914914' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: {
      id: '91491491-4914-4914-8914-914914914914',
      categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: 'Cebu Clean Co',
      frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
      servicePrice: 50_000, serviceFee: 5_000, totalAmount: 55_000,
      nextScheduledDate: '2026-09-08', address: '1 Test Street', barangay: 'Lahug',
      city: 'Cebu City', province: 'Cebu', totalCompleted: 2, totalSkipped: 0,
      cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
    } } }),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@/utils/errors', () => ({
  getErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
}));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('Bug UX-914 — a failed recurring cancellation preserves the customer reason and retry form', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel recurring booking' }));
  const reason = screen.getByLabelText('Recurring cancellation reason');
  fireEvent.change(reason, { target: { value: 'The weekly schedule is no longer needed.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm recurring cancellation' }));

  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('cancellation unavailable', 'error'));
  expect(mockPost).toHaveBeenCalledWith(
    '/api/v1/recurring/91491491-4914-4914-8914-914914914914/cancel',
    { reason: 'The weekly schedule is no longer needed.' },
  );
  expect((screen.getByLabelText('Recurring cancellation reason') as HTMLTextAreaElement).value)
    .toBe('The weekly schedule is no longer needed.');
});
