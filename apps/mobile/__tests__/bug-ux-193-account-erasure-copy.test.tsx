import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/data-management.service', () => ({
  getAccountDeletionStatus: jest.fn().mockResolvedValue(null),
  getDataExportStatus: jest.fn().mockResolvedValue([]),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  requestDataExport: jest.fn(),
  getDataExportDownloadUrl: jest.fn(),
}));

import CustomerAccountManagementScreen from '../app/customer/account-management';
import ProviderAccountManagementScreen from '../app/provider/account-management';

function withQueries(element: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{element}</QueryClientProvider>;
}

it('BUG-UX-193 — customer and provider account forms describe deactivation and anonymization instead of permanent deletion', async () => {
  const customer = render(withQueries(<CustomerAccountManagementScreen />));
  fireEvent.click(await screen.findByText('Request Account Deactivation'));
  expect(screen.getAllByText('Deactivate & Anonymize My Account')).toHaveLength(2);
  expect(screen.queryByText('Permanently Delete My Account')).toBeNull();
  customer.unmount();

  render(withQueries(<ProviderAccountManagementScreen />));
  fireEvent.click(await screen.findByText('Request Account Deactivation'));
  expect(screen.getAllByText('Deactivate & Anonymize My Account')).toHaveLength(2);
  expect(screen.queryByText('Permanently Delete My Account')).toBeNull();
});
