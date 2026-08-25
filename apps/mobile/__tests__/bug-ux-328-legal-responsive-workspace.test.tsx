import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue({
    version: 1,
    effective_from: '2026-08-24',
    tiers: [],
    intro_text: 'Current policy',
    legal_disclaimer: 'Interim disclaimer',
    provider_no_show_credit_php: 0,
  }),
  policyToTermsText: jest.fn().mockReturnValue('Current cancellation policy'),
}));

import TermsScreen from '../app/customer/terms';

it('Bug UX-328 — legal documents use a bounded section-and-document workspace on tablet and desktop', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><TermsScreen /></QueryClientProvider>);

  const workspace = screen.getByLabelText('Tablet and desktop legal document workspace');
  expect(workspace.textContent).toContain('Terms of Service');
  expect(workspace.querySelectorAll('[role="tab"]').length).toBeGreaterThan(1);
});
