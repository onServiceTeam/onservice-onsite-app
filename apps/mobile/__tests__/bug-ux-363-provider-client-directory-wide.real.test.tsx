import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 820,
    breakpoint: 'tablet',
    isPhone: false,
    isTablet: true,
    isDesktop: false,
  }),
  byBreakpoint: (_breakpoint: string, values: { tablet: number }) => values.tablet,
}));
jest.mock('@/services/provider-crm.service', () => ({
  getProviderClients: jest.fn().mockResolvedValue([
    {
      customerId: 'customer-1',
      customerName: 'Maria Santos',
      totalJobValue: 420000,
      jobCount: 3,
      completedCount: 2,
      lastJobAt: '2026-08-20T08:00:00.000Z',
    },
  ]),
}));

import ProviderClientsScreen from '../app/provider/clients';

it('Bug UX-363 — provider client directory uses a bounded tablet grid with an accessible relationship action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  const { container } = render(
    <QueryClientProvider client={client}>
      <ProviderClientsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Maria Santos')).toBeTruthy();
  expect(container.querySelector('flatlist')?.getAttribute('accessibilitylabel')).toBe('Wide provider client directory');
  fireEvent.click(screen.getByLabelText('Open client Maria Santos. 3 jobs, 2 completed.'));
  expect(mockPush).toHaveBeenCalledWith('/provider/clients/customer-1');
  expect(screen.getByText('View relationship ›')).toBeTruthy();
});
