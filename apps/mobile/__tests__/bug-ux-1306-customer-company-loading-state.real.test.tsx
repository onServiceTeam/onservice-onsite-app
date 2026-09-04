import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '13060000-abcd-4abc-8def-000000001306' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: jest.fn().mockResolvedValue({
    id: '13060000-abcd-4abc-8def-000000001306', companyName: 'Loading State Co', businessType: 'other',
    city: 'Cebu City', province: 'Cebu', status: 'active',
    viewerPermissions: {
      role: 'owner', canBook: true, canApprove: true,
      canViewInvoices: true, canViewFinancials: true,
    },
  }),
  getMembers: jest.fn().mockResolvedValue([{
    id: 'member-1306', userId: 'customer-1306', role: 'owner', canBook: true,
    canApprove: true, canViewInvoices: true, firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.test',
  }]),
  getCurrentTerms: jest.fn(() => new Promise(() => {})),
  getContracts: jest.fn(() => new Promise(() => {})),
  getInvoices: jest.fn(() => new Promise(() => {})),
}));

import BusinessAccountWorkspaceScreen from '../app/customer/business/[id]';
import { getContracts, getCurrentTerms, getInvoices } from '@/services/business.service';

it('Bug UX-1306 - company workspace shows loading instead of false financial empty states', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  expect(await screen.findByText('Loading State Co')).toBeTruthy();
  await waitFor(() => {
    expect(getCurrentTerms).toHaveBeenCalledWith('13060000-abcd-4abc-8def-000000001306');
    expect(getContracts).toHaveBeenCalled();
    expect(getInvoices).toHaveBeenCalled();
  });

  expect(screen.getAllByText('Loading...')).toHaveLength(4);
  expect(screen.getByText('Loading provider contracts...')).toBeTruthy();
  expect(screen.getByText('Loading commercial statements...')).toBeTruthy();
  expect(screen.queryByText('Not published')).toBeNull();
  expect(screen.queryByText('No provider contracts are recorded.')).toBeNull();
  expect(screen.queryByText('No finalized statements are available.')).toBeNull();
});
