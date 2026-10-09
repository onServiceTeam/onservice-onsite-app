import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockGetBusinessAccount = jest.fn();
const mockGetMembers = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'not-a-business-account' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: (...args: unknown[]) => mockGetBusinessAccount(...args),
  getMembers: (...args: unknown[]) => mockGetMembers(...args),
  getCurrentTerms: jest.fn(),
  getContracts: jest.fn(),
  getInvoices: jest.fn(),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';

it('Bug UX-1239 - a malformed customer company route fails locally before company-data reads', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(screen.getByText('Company not found')).toBeTruthy();
  expect(screen.getByText(/valid Business Account ID/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Return to company workspaces' })).toBeTruthy();
  expect(mockGetBusinessAccount).not.toHaveBeenCalled();
  expect(mockGetMembers).not.toHaveBeenCalled();
});
