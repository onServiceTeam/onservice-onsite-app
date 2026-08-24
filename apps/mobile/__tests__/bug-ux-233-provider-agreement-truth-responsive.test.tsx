import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import ProviderAgreementScreen from '../app/provider-onboarding/terms';

it('Bug UX-233 — provider agreement uses a bounded desktop workspace and ties release claims to server-backed booking state', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderAgreementScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Desktop provider agreement workspace')).toBeTruthy();
  expect(screen.getByText(/rely on the booking's paid and escrow status/i)).toBeTruthy();
  expect(screen.getByText(/Release follows customer confirmation or the platform completion timer/i)).toBeTruthy();
  expect(screen.queryByText(/held in escrow until the job is confirmed complete/i)).toBeNull();
});
