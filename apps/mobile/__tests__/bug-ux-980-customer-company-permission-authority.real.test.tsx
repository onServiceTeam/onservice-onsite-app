import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '98000000-abcd-4abc-8def-000000000980' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: jest.fn().mockResolvedValue({
    id: '98000000-abcd-4abc-8def-000000000980', companyName: 'Permission Authority Co', businessType: 'other',
    city: 'Cebu City', province: 'Cebu', status: 'active',
    viewerPermissions: {
      role: 'manager', canBook: true, canApprove: true,
      canViewInvoices: false, canViewFinancials: true,
    },
  }),
  getMembers: jest.fn().mockRejectedValue(new Error('Team directory temporarily unavailable')),
  getCurrentTerms: jest.fn().mockResolvedValue({
    id: 'terms-980', version: 2, paymentTerms: 'net_30',
    volumeDiscountRate: 5, monthlyCreditLimit: 2_000_000, currency: 'PHP',
    effectiveFrom: '2026-09-02T00:00:00.000Z',
  }),
  getContracts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getInvoices: jest.fn().mockResolvedValue({ items: [], total: 0 }),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';
import { getContracts, getCurrentTerms, getInvoices } from '@/services/business.service';

it('Bug UX-980 — viewer-specific account permission remains authoritative when the team directory fails', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(await screen.findByText('Approved credit')).toBeTruthy();
  expect(screen.getByText('Team access could not be loaded. Pull down to retry.')).toBeTruthy();
  expect(getCurrentTerms).toHaveBeenCalledWith('98000000-abcd-4abc-8def-000000000980');
  expect(getContracts).toHaveBeenCalled();
  expect(getInvoices).toHaveBeenCalled();
});
