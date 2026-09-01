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
      role: 'owner', canBook: true, canApprove: true,
      canViewInvoices: true, canViewFinancials: true,
    },
  }),
  getMembers: jest.fn().mockResolvedValue([{
    id: 'member-1', userId: 'customer-1', role: 'manager', canBook: true,
    canApprove: true, canViewInvoices: true, firstName: 'Ana', lastName: 'Reyes', email: 'ana@example.test',
  }]),
  getCurrentTerms: jest.fn().mockResolvedValue({
    id: 'terms-1', version: 2, paymentTerms: 'net_30', volumeDiscountRate: 7.5,
    monthlyCreditLimit: 7_500_000, currency: 'PHP', effectiveFrom: '2026-09-01T00:00:00.000Z',
  }),
  getContracts: jest.fn().mockResolvedValue({ items: [{
    id: 'contract-1', contractType: 'recurring', frequency: 'monthly', status: 'active',
    agreedRate: 100_000, startDate: '2026-09-01', endDate: null, providerId: 'provider-1',
  }], total: 1 }),
  getInvoices: jest.fn().mockResolvedValue({ items: [{
    id: 'invoice-1', invoiceNumber: 'INV-202609-TEST', billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31', totalAmount: 100_000, status: 'sent', settlementState: 'open',
  }], total: 1 }),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';

it('Bug UX-973 — company detail links role, terms, contracts, statements, and the held booking boundary in one tablet workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(await screen.findByText('Cebu Build Co')).toBeTruthy();
  expect(screen.getByText('Company-paid booking is not open yet')).toBeTruthy();
  expect(screen.getByText('Version 2')).toBeTruthy();
  expect(screen.getByText('Team and permissions')).toBeTruthy();
  expect(screen.getByText('Provider contracts')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open statement INV-202609-TEST' })).toBeTruthy();
});
