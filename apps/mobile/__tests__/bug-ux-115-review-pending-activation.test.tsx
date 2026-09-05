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
  useAuthStore: Object.assign(() => ({ setUser: mockSetUser, isAuthenticated: true,
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }), {
    getState: () => ({ setUser: mockSetUser, isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }),
  }),
}));

import ReviewPendingScreen from '../app/provider-onboarding/review-pending';

it('BUG-UX-115 — an approved application opens the provider workspace only after auth confirms the provider role', async () => {
  mockGetApplicationStatus.mockResolvedValue({ status: 'approved', rejectionReason: null });
  (api.get as jest.Mock).mockResolvedValueOnce({
    status: 200, data: { success: true, data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'provider', phone: '+639170000000', email: null, firstName: 'Synthetic', lastName: 'Applicant', avatarUrl: null } },
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
  // This static auth fixture retains the applicant screen after replace.
  // Customer exit is deliberately available until the real role transition.
  expect(screen.getByText('Go to Customer Home')).toBeTruthy();
});
