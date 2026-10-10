import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

import CustomerHelpScreen from '../app/customer/help';
import ProviderHelpScreen from '../app/provider/help';
import { platformConfig } from '@/config/platform.config';

describe('BUG-PHASE102-01 - help pages show the shared app version', () => {
  it('renders the configured version in customer and provider help workspaces', () => {
    const customer = render(<CustomerHelpScreen />);
    expect(screen.getByLabelText('Desktop customer help workspace')).toBeTruthy();
    expect(screen.getByText(`onService v${platformConfig.appVersion}`)).toBeTruthy();
    customer.unmount();

    render(<ProviderHelpScreen />);
    expect(screen.getByLabelText('Desktop provider help workspace')).toBeTruthy();
    expect(screen.getByText(`onService v${platformConfig.appVersion}`)).toBeTruthy();
  });
});
