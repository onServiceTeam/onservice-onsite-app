// Bug UX-1397: the Lock icon on the provider earnings screen's "Pending job
// earnings" card was drawn in the orange accent (#FE8A00). Orange on white is
// about 2.4:1, below the WCAG 2.2 AA minimum of 3:1 for meaningful icons, and
// Ken does not want orange in the brand look. The icon now uses the brand
// blue (colors.primary).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@/config/theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({
    id: 'wallet-1',
    userId: 'provider-1',
    type: 'provider',
    availableBalance: 1_245_000,
    pendingBalance: 320_000,
    currency: 'PHP',
    createdAt: '2026-08-01T00:00:00.000Z',
  }),
}));
jest.mock('@/services/provider-tools.service', () => ({
  getEarningsSummary: jest.fn().mockResolvedValue({
    earnedToday: 85_000,
    earnedThisWeek: 450_000,
    earnedThisMonth: 1_458_000,
    pendingEscrow: 320_000,
    jobsToday: 1,
    jobsThisWeek: 5,
    jobsThisMonth: 18,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn((url: string) => {
      if (url.includes('/earnings/trends')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
    }),
  },
}));

import EarningsScreen from '../app/(provider-tabs)/earnings';

it('Bug UX-1397 — the "Pending job earnings" card icon is brand blue, not the low-contrast orange accent', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <EarningsScreen />
    </QueryClientProvider>,
  );

  const label = await screen.findByText('Pending job earnings');
  const card = label.parentElement!;
  const icon = card.querySelector('[data-icon="Lock"]');
  expect(icon).not.toBeNull();
  expect(icon!.getAttribute('color')).toBe(colors.primary);
  expect(icon!.getAttribute('color')).not.toBe(colors.accent);
});
