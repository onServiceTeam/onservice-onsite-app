import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useAuthStore: () => ({ setUser: jest.fn() }),
}));

import ReviewPendingScreen from '../app/provider-onboarding/review-pending';

it('BUG-PHASE95-01 — pending applicants poll their auth-only application status without receiving provider access', async () => {
  mockGetApplicationStatus.mockResolvedValue({ status: 'pending', rejectionReason: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={client}>
      <ReviewPendingScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('Application Under Review')).toBeTruthy());
  expect(mockGetApplicationStatus).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Manual document review')).toBeTruthy();
  expect(screen.queryByText('24-48 hours')).toBeNull();

  fireEvent.click(screen.getByText('Go to Customer Home'));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
});
