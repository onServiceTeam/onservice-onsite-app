import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }) }));

const mockApiGet = jest.fn();

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

import BackgroundCheckStatusScreen from '../app/provider-onboarding/background-check-status';

describe('provider background-check status', () => {
  it('Bug CRIT-K07 — the screen renders the rejection returned by the application-status API', async () => {
    mockApiGet.mockResolvedValue({
      status: 200, data: { success: true, data: { status: 'rejected', rejectionReason: 'Government ID details did not match.' } },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { getByText } = render(<QueryClientProvider client={client}><BackgroundCheckStatusScreen /></QueryClientProvider>);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/providers/application-status');
      expect(getByText('Application not approved')).toBeTruthy();
      expect(getByText('Government ID details did not match.')).toBeTruthy();
    });
  });
});
