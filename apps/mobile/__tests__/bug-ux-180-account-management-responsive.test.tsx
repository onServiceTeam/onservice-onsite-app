import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
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

function wrap(screenElement: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{screenElement}</QueryClientProvider>;
}

it('BUG-UX-180 — customer and provider account tools use a bounded two-panel desktop workspace', () => {
  const customer = render(wrap(<CustomerAccountManagementScreen />));
  expect(screen.getByLabelText('Tablet and desktop account data workspace')).toBeTruthy();
  customer.unmount();

  render(wrap(<ProviderAccountManagementScreen />));
  expect(screen.getByLabelText('Tablet and desktop account data workspace')).toBeTruthy();
});
