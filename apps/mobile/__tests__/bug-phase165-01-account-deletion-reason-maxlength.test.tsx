import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
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

function wrap(screenElement: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{screenElement}</QueryClientProvider>;
}

it('BUG-PHASE165-01 — customer and provider deletion reasons stop accepting text after 1,000 characters', async () => {
  const customer = render(wrap(<CustomerAccountManagementScreen />));
  fireEvent.click(await screen.findByText('Request Account Deactivation'));
  expect(screen.getByPlaceholderText("Tell us why you're leaving...").getAttribute('maxlength')).toBe('1000');
  customer.unmount();

  render(wrap(<ProviderAccountManagementScreen />));
  fireEvent.click(await screen.findByText('Request Account Deactivation'));
  expect(screen.getByPlaceholderText("Tell us why you're leaving...").getAttribute('maxlength')).toBe('1000');
});
