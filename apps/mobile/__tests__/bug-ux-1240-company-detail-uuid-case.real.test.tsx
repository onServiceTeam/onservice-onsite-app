import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '12400000-ABCD-4ABC-8DEF-000000001240' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: jest.fn().mockResolvedValue({
    id: '12400000-abcd-4abc-8def-000000001240', companyName: 'Canonical Company Co',
    businessType: 'other', city: 'Cebu City', province: 'Cebu', status: 'active',
    viewerPermissions: {
      role: 'member', canBook: false, canApprove: false,
      canViewInvoices: false, canViewFinancials: false,
    },
  }),
  getMembers: jest.fn().mockResolvedValue([]),
  getCurrentTerms: jest.fn(),
  getContracts: jest.fn(),
  getInvoices: jest.fn(),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';
import { getBusinessAccount, getMembers } from '@/services/business.service';

it('Bug UX-1240 - an uppercase customer company UUID is canonicalized before account and member reads', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(await screen.findByText('Canonical Company Co')).toBeTruthy();
  await waitFor(() => {
    expect(getBusinessAccount).toHaveBeenCalledWith('12400000-abcd-4abc-8def-000000001240');
    expect(getMembers).toHaveBeenCalledWith('12400000-abcd-4abc-8def-000000001240');
  });
});
