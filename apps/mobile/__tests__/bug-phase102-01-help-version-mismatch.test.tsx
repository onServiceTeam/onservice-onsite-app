import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), usePathname: () => '/customer/help',
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1366,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn(),
  policyToHelpAnswer: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
// The real version source: app.config.ts's version as Expo exposes it (the
// web app; no installed build in jsdom). platformConfig.appVersion used to be
// a hard-coded '0.1.0' that every build showed.
jest.mock('expo-constants', () => {
  const constants = { expoConfig: { version: '1.0.1', extra: { sentryDsn: '', eas: { projectId: 'test' } } } };
  return { ...constants, default: constants };
});

import CustomerHelpScreen from '../app/customer/help';
import ProviderHelpScreen from '../app/provider/help';
import { platformConfig } from '@/config/platform.config';

describe('BUG-PHASE102-01 - help pages show the shared app version', () => {
  it('renders the real app version (from the app build, not a hard-coded 0.1.0) in customer and provider help workspaces', () => {
    expect(platformConfig.appVersion).toBe('1.0.1');
    const customer = render(<CustomerHelpScreen />);
    expect(screen.getByLabelText('Desktop customer help workspace')).toBeTruthy();
    expect(screen.getByText('onService v1.0.1')).toBeTruthy();
    expect(screen.queryByText('onService v0.1.0')).toBeNull();
    customer.unmount();

    render(<ProviderHelpScreen />);
    expect(screen.getByLabelText('Desktop provider help workspace')).toBeTruthy();
    expect(screen.getByText('onService v1.0.1')).toBeTruthy();
    expect(screen.queryByText('onService v0.1.0')).toBeNull();
  });
});
