import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockTab = 'terms';
const mockPush = jest.fn();
const mockRequestOtp = jest.fn();
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) => ReactLib.createElement('div', { 'data-testid': 'protected-customer-stack' }, children);
  Stack.Screen = () => null;
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({ tab: mockTab }),
    // Render the configured Link destination as an anchor. Actual Expo routing
    // and browser keyboard behavior also require the exported-build check.
    Link: ({ href, children, testID }: { href: string | { pathname: string; params: Record<string, string> }; children: React.ReactNode; testID?: string }) => {
      const destination = typeof href === 'string' ? href : `${href.pathname}?${new URLSearchParams(href.params)}`;
      return ReactLib.createElement('a', {
        href: destination, 'data-testid': testID,
        onClick: (event: React.MouseEvent) => { event.preventDefault(); mockPush(destination); },
      }, children);
    },
    Stack,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: false, user: null }),
}));
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: mockRequestOtp, captchaModal: null }),
}));
jest.mock('@/config/demo', () => ({ DEMO_MODE: false, demoLogin: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue({ version: 1, tiers: [] }),
  policyToTermsText: () => 'Current cancellation policy',
}));

import LoginScreen from '../app/auth/login';
import RegisterScreen from '../app/auth/register';
import PublicLegalScreen from '../app/legal';
import CustomerLayout from '../app/customer/_layout';

it('Bug UX-1310 — signed-out login and registration link to readable public policies without opening customer account routes', () => {
  for (const Screen of [LoginScreen, RegisterScreen]) {
    const view = render(<Screen />);
    for (const [name, tab] of [['Terms of Service', 'terms'], ['Privacy Policy', 'privacy']]) {
      const link = view.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(`/legal?tab=${tab}`);
      expect(link.tabIndex).toBe(0);
      fireEvent.click(link);
      expect(mockPush).toHaveBeenLastCalledWith(`/legal?tab=${tab}`);
    }
    cleanup();
  }
  expect(mockRequestOtp).not.toHaveBeenCalled();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  for (const tab of ['terms', 'privacy']) {
    mockTab = tab;
    const view = render(<QueryClientProvider client={client}><PublicLegalScreen /></QueryClientProvider>);
    expect(view.getByText('Legal & Privacy')).toBeTruthy();
    expect(view.getByText(tab === 'terms' ? /You must be at least 18 years old/ : /Personal Information Controller/)).toBeTruthy();
    expect(view.queryByTestId('role-redirect')).toBeNull();
    cleanup();
  }
  client.clear();
  const guarded = render(<CustomerLayout />);
  expect(guarded.getByTestId('role-redirect').getAttribute('data-href')).toBe('/auth/login');
  expect(guarded.queryByTestId('protected-customer-stack')).toBeNull();
});
