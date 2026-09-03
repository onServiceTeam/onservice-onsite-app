import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'business-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1' } }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: jest.fn().mockResolvedValue({
    id: 'business-1', companyName: 'Cebu Build Co', businessType: 'other',
    city: 'Cebu City', province: 'Cebu', status: 'active',
    viewerPermissions: {
      role: 'member', canBook: true, canApprove: false,
      canViewInvoices: false, canViewFinancials: false,
    },
  }),
  getMembers: jest.fn().mockResolvedValue([{
    id: 'member-1', userId: 'customer-1', role: 'member', canBook: true,
    canApprove: false, canViewInvoices: false, firstName: 'Ana', lastName: 'Reyes', email: 'ana@example.test',
  }]),
  getCurrentTerms: jest.fn(),
  getContracts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getInvoices: jest.fn(),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';
import { getContracts, getCurrentTerms, getInvoices } from '@/services/business.service';

it('Bug UX-976 — a member without financial permission sees no rates, terms, credit, contract, or statement request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(await screen.findByText('Financial details are restricted')).toBeTruthy();
  expect(screen.queryByText('Commercial statements')).toBeNull();
  expect(screen.queryByText('Provider contracts')).toBeNull();
  expect(screen.queryByText('Approved credit')).toBeNull();
  expect(getCurrentTerms).not.toHaveBeenCalled();
  expect(getContracts).not.toHaveBeenCalled();
  expect(getInvoices).not.toHaveBeenCalled();
});
