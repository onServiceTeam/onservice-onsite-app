import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockGetApplicationStatus = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/services/provider-api.service', () => ({
  getApplicationStatus: (...args: unknown[]) => mockGetApplicationStatus(...args),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: false }),
}));

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ setUser: jest.fn(), isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }),
}));

import ReviewPendingScreen from '../app/provider-onboarding/review-pending';

it('BUG-PHASE95-01 — pending applicants poll their auth-only application status without receiving provider access', async () => {
  jest.useFakeTimers();
  mockGetApplicationStatus.mockResolvedValue({ status: 'pending', rejectionReason: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <ReviewPendingScreen />
    </QueryClientProvider>,
  );

  await act(async () => { await jest.advanceTimersByTimeAsync(10); });
  expect(screen.getByText('Application submitted')).toBeTruthy();
  expect(mockGetApplicationStatus).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/cannot yet confirm whether the review has started/i)).toBeTruthy();
  expect(screen.queryByText('In review')).toBeNull();
  expect(screen.queryByText('24-48 hours')).toBeNull();

  await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
  expect(mockGetApplicationStatus).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Application submitted')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Go to Customer Home'));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  view.unmount();
  client.clear();
  jest.useRealTimers();
});
