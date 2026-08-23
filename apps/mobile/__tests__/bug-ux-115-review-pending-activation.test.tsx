import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';

const mockReplace = jest.fn();
const mockSetUser = jest.fn();
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
  useAuthStore: () => ({ setUser: mockSetUser }),
}));

import ReviewPendingScreen from '../app/provider-onboarding/review-pending';

it('BUG-UX-115 — an approved application opens the provider workspace only after auth confirms the provider role', async () => {
  mockGetApplicationStatus.mockResolvedValue({ status: 'approved', rejectionReason: null });
  (api.get as jest.Mock).mockResolvedValueOnce({
    data: { data: { id: 'user-1', role: 'provider', phone: '+639171234567' } },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={client}>
      <ReviewPendingScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(provider-tabs)/dashboard'));
  expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me');
  expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'provider' }));
  expect(screen.queryByText('Go to Customer Home')).toBeNull();
});
