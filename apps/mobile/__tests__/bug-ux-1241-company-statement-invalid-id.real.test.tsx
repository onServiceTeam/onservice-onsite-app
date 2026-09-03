import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetInvoiceDetail = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({
    id: '12410000-abcd-4abc-8def-000000001241',
    invoiceId: 'not-a-company-statement',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/business.service', () => ({
  getInvoiceDetail: (...args: unknown[]) => mockGetInvoiceDetail(...args),
}));

import BusinessStatementScreen from '../app/customer/business/[id]/invoices/[invoiceId]';

it('Bug UX-1241 - a malformed customer statement route fails locally before its financial read', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessStatementScreen /></QueryClientProvider>);

  expect(screen.getByText('Statement not found')).toBeTruthy();
  expect(screen.getByText(/valid Business Account and statement IDs/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Return to company records' })).toBeTruthy();
  expect(mockGetInvoiceDetail).not.toHaveBeenCalled();
});
