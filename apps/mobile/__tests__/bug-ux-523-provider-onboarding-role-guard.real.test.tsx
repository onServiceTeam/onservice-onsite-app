import React from 'react';
import { render, screen } from '@testing-library/react';

let mockRole: 'customer' | 'provider' = 'provider';

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { role: mockRole },
  }),
}));

jest.mock('@/components/ProviderOnboardingDraftGuard', () => ({
  ProviderOnboardingDraftGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-router', () => {
  const ReactRuntime = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    ReactRuntime.createElement('nav', { 'aria-label': 'Provider onboarding routes' }, children);
  Stack.Screen = ({ name }: { name: string }) =>
    ReactRuntime.createElement('span', { 'data-route-name': name }, name);
  const Redirect = ({ href }: { href: string }) =>
    ReactRuntime.createElement('span', { 'aria-label': `Redirect to ${href}` }, href);
  return { Stack, Redirect };
});

import ProviderOnboardingLayout from '../app/provider-onboarding/_layout';

it('Bug UX-523 — only customer accounts can enter the provider application route group', () => {
  mockRole = 'provider';
  const view = render(<ProviderOnboardingLayout />);

  expect(screen.getByLabelText('Redirect to /(provider-tabs)/dashboard')).toBeTruthy();
  expect(screen.queryByLabelText('Provider onboarding routes')).toBeNull();

  mockRole = 'customer';
  view.rerender(<ProviderOnboardingLayout />);

  expect(screen.getByLabelText('Provider onboarding routes')).toBeTruthy();
  expect(view.container.querySelector('[data-route-name="terms"]')).not.toBeNull();
});
