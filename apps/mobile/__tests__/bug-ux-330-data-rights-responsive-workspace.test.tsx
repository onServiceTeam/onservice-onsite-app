import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/compliance.service', () => ({
  listMyDsrs: jest.fn().mockResolvedValue([]),
  listPendingMaterialConsents: jest.fn().mockResolvedValue([]),
  recordConsent: jest.fn(),
  submitDataSubjectRequest: jest.fn(),
}));

import DataRightsScreen from '../app/customer/data-rights';

it('Bug UX-330 — data-rights actions and request history share a bounded tablet and desktop workspace', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DataRightsScreen /></QueryClientProvider>);

  const workspace = screen.getByLabelText('Tablet and desktop data rights workspace');
  expect(workspace.textContent).toContain('Choose what you need');
  expect(workspace.textContent).toContain('My past requests');
});
