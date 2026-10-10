import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn().mockResolvedValue({ status: 200, data: { success: true, data: { status: 'pending', rejectionReason: null } } });
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }) }));

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import BackgroundCheckStatusScreen from '../app/provider-onboarding/background-check-status';

it('Bug UX-321 — application review shows only server-recorded status and no fabricated rolling ETA or unsupported review SLA', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BackgroundCheckStatusScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop application review status workspace')).toBeTruthy();
  expect(await screen.findByText('Application submitted')).toBeTruthy();
  expect(screen.queryByText('Your provider application is under review.')).toBeNull();
  expect(screen.queryByText(/Estimated completion/i)).toBeNull();
  expect(screen.queryByText(/48 hours/i)).toBeNull();
  expect(screen.queryByText(/5 business days/i)).toBeNull();
  await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
});
