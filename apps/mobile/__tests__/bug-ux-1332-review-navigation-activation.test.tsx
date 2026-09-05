import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { refreshAuthSession } from '@/services/api';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';
import { resetApplicationSession } from '@/stores/provider-application-session.store';
import { applicant, deferred } from '../test-support/application-draft-fixture';
import Review from '../app/provider-onboarding/review-pending';

const mockApplicant = applicant;
let mockRoute = 'review-pending';
const mockSetUser = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useSegments: () => ['provider-onboarding', mockRoute],
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }), Redirect: () => null }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: Object.assign((selector?: (state: unknown) => unknown) => {
  const state = { user: mockApplicant, isAuthenticated: true, setUser: mockSetUser };
  return selector ? selector(state) : state;
}, { getState: () => ({ user: mockApplicant, isAuthenticated: true, setUser: mockSetUser }) }) }));

it('Bug UX-1332 — leaving a retained review screen prevents its delayed activation from opening the provider workspace', async () => {
  resetApplicationSession();
  const refresh = deferred<boolean>();
  jest.mocked(refreshAuthSession).mockReturnValueOnce(refresh.promise);
  jest.mocked(api.get).mockResolvedValue({ status: 200, ok: true, data: { success: true, data: { status: 'approved', rejectionReason: null } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function RetainedScreen() {
    return <QueryClientProvider client={client}><ProviderApplicationSessionGate><Review /></ProviderApplicationSessionGate></QueryClientProvider>;
  }
  const view = render(<RetainedScreen />);
  await waitFor(() => expect(refreshAuthSession).toHaveBeenCalledTimes(1));
  mockRoute = 'background-check-status';
  view.rerender(<RetainedScreen />);
  await act(async () => refresh.resolve(true));
  expect(api.get).not.toHaveBeenCalledWith('/api/v1/auth/me');
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
