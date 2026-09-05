import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';

const mockReplace = jest.fn();
const mockSetUser = jest.fn();
const mockLogout = jest.fn().mockResolvedValue(undefined);
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
    getState: () => ({ setUser: mockSetUser, logout: mockLogout, isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }),
  }),
}));

import ReviewPendingScreen from '../app/provider-onboarding/review-pending';

it('BUG-UX-115 — approval never grants provider authority from a status label and instead offers explicit fresh sign-in', async () => {
  mockGetApplicationStatus.mockResolvedValue({ status: 'approved', rejectionReason: null });
  (api.get as jest.Mock).mockResolvedValueOnce({
    status: 200, data: { success: true, data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'provider', phone: '+639170000000', email: null, firstName: 'Synthetic', lastName: 'Applicant', avatarUrl: null } },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <ReviewPendingScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Application approved')).toBeTruthy();
  expect(refreshAuthSession).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByText('Go to Customer Home')).toBeNull();
  expect(mockLogout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
  expect(mockLogout).toHaveBeenCalledWith('sign-in-required');
  view.unmount();
  client.clear();
});
