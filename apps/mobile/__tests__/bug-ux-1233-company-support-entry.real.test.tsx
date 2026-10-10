import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '12330000-abcd-4abc-8def-000000001233' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false, businessContractBookingEnabled: false }),
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccount: jest.fn().mockResolvedValue({
    id: '12330000-abcd-4abc-8def-000000001233', companyName: 'Cebu Build Co', businessType: 'other',
    city: 'Cebu City', province: 'Cebu', status: 'active',
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

it('Bug UX-1233 - every authorized customer company member can start Support with the exact account context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountWorkspaceScreen /></QueryClientProvider>);

  const supportAction = await screen.findByRole('button', { name: 'Get support for Cebu Build Co' });
  fireEvent.click(supportAction);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      businessAccountId: '12330000-abcd-4abc-8def-000000001233',
      businessName: 'Cebu Build Co',
      type: 'general_inquiry',
      subject: 'Help with Cebu Build Co',
    },
  });
});
