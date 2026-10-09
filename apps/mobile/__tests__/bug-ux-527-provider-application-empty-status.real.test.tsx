import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer' } }) }));

const mockApiGet = jest.fn().mockResolvedValue({ data: { success: true, data: null } });
const mockReplace = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: true }),
}));

import BackgroundCheckStatusScreen from '../app/provider-onboarding/background-check-status';

it('Bug UX-527 — a null application response is shown as no application and never fabricated as pending', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><BackgroundCheckStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('No provider application found')).toBeTruthy();
  expect(screen.queryByText('Pending')).toBeNull();
  expect(screen.queryByText('Your provider application is under review.')).toBeNull();

  fireEvent.click(screen.getByText('Start or return to application'));
  expect(mockReplace).toHaveBeenCalledWith('/provider-onboarding/role-select');
  view.unmount();
});
