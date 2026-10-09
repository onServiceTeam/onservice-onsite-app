import React from 'react';
import { act, render, screen } from '@testing-library/react';
import api from '@/services/api';
import Layout from '../app/provider-onboarding/_layout';
import { resetApplicationSession } from '@/stores/provider-application-session.store';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { apiDraft, applicant, deferred } from '../test-support/application-draft-fixture';

const mockApplicant = applicant;
const mockNavigatorMounted = jest.fn();
const mockNavigatorUnmounted = jest.fn();
let mockRoute = 'role-select';
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mockApplicant, isAuthenticated: true }) }));
jest.mock('expo-router', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');
  // This double measures navigator lifetime, not React Navigation behavior.
  // The companion compiled-browser flow covers the real navigator.
  function Stack({ screenLayout }: { screenLayout?: (props: { children: React.ReactNode; route: { name: string } }) => React.ReactNode }) {
    ReactRuntime.useEffect(() => { mockNavigatorMounted(); return () => { mockNavigatorUnmounted(); }; }, []);
    const children = <input aria-label="Current applicant form" defaultValue={mockRoute} />;
    return <div aria-label="Applicant navigator">{screenLayout ? screenLayout({ children, route: { name: mockRoute } }) : children}</div>;
  }
  Stack.Screen = () => null;
  return { Stack, useSegments: () => ['provider-onboarding', mockRoute], Redirect: ({ href }: { href: string }) => <span>{href}</span> };
});

it('Bug UX-1335 — loading an applicant draft gates form controls without destroying the mounted navigator', async () => {
  resetApplicationSession();
  const pending = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.get).mockReturnValueOnce(pending.promise);
  const view = render(<Layout />);
  expect(mockNavigatorMounted).toHaveBeenCalledTimes(1);
  act(() => useOnboardingStore.getState().setRole('provider'));
  mockRoute = 'categories';
  view.rerender(<Layout />);
  expect(screen.queryByLabelText('Current applicant form')).toBeNull();
  expect(screen.getByLabelText('Applicant navigator')).toBeTruthy();
  expect(mockNavigatorUnmounted).not.toHaveBeenCalled();
  await act(async () => pending.resolve(apiDraft(null)));
  expect(screen.getByLabelText('Current applicant form')).toHaveProperty('value', 'categories');
  expect(useOnboardingStore.getState().selectedRole).toBe('provider');
  expect(mockNavigatorMounted).toHaveBeenCalledTimes(1);
  expect(mockNavigatorUnmounted).not.toHaveBeenCalled();
});
