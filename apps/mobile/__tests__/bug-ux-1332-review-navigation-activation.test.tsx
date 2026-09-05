import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';
import { resetApplicationSession } from '@/stores/provider-application-session.store';
import { applicant, deferred } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';

const mockApplicant = applicant;
let mockRoute = 'review-pending';
const mockSetUser = jest.fn();
const mockLogout = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useSegments: () => ['provider-onboarding', mockRoute],
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }), Redirect: () => null }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: Object.assign((selector?: (state: unknown) => unknown) => {
  const state = { user: mockApplicant, isAuthenticated: true, setUser: mockSetUser };
  return selector ? selector(state) : state;
}, { getState: () => ({ user: mockApplicant, isAuthenticated: true, setUser: mockSetUser, logout: mockLogout }) }) }));

it('Bug UX-1332 — leaving a retained review screen prevents a delayed approval observation from signing out or promoting the current session', async () => {
  resetApplicationSession();
  const status = deferred<never>();
  jest.mocked(api.get).mockReturnValueOnce(status.promise);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function RetainedScreen() {
    return <QueryClientProvider client={client}><ProviderApplicationSessionGate><Review /></ProviderApplicationSessionGate></QueryClientProvider>;
  }
  const view = render(<RetainedScreen />);
  expect(await screen.findByText('Checking application status…')).toBeTruthy();
  mockRoute = 'background-check-status';
  view.rerender(<RetainedScreen />);
  await act(async () => status.resolve({ status: 200, ok: true, data: { success: true, data: { status: 'approved', rejectionReason: null } } } as never));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }));
  expect(mockLogout).not.toHaveBeenCalled();
  expect(refreshAuthSession).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalledWith('/api/v1/auth/me');
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
