// Phase E CRIT-108 / CRIT-109 / CRIT-110 / CRIT-113 - runtime verification.
//
// Portfolio and certification picker behavior is covered by the dedicated
// real-render tests (BUG-UX-097/100 and BUG-PHASE197). This file covers the
// remaining retired-skills route and the withdrawal earnings-chart wire at
// runtime, without inspecting implementation text.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockApiGet = jest.fn();
const mockGetWalletBalance = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args), post: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import ProviderSkillsScreen from '../app/provider/skills';
import WithdrawScreen from '../app/provider/withdraw';

function renderWithQuery(child: React.ReactElement): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWalletBalance.mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider',
    availableBalance: 100_000, pendingBalance: 0, currency: 'PHP', createdAt: '2026-08-31T00:00:00.000Z',
  });
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return Promise.resolve({ data: { data: { preferredMethod: 'gcash', destinationAccount: '09171234567' } } });
    }
    if (url.includes('/api/v1/providers/me/earnings/trends')) {
      return Promise.resolve({ data: { data: [
        { period: '2026-08-30T00:00:00+08:00', netEarned: '10000' },
        { period: '2026-08-31T00:00:00+08:00', netEarned: 20000 },
      ] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

describe('Phase E CRIT-110 - retired provider skills route lands on catalog services', () => {
  it('CRIT-110 - the real route redirects to Services and leaves a truthful fallback', async () => {
    render(<ProviderSkillsScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/provider/services'));
    expect(screen.getByText('Manage Your Services')).toBeTruthy();
    expect(screen.getByText('Go to Services')).toBeTruthy();
  });
});

describe('Phase E CRIT-113 - withdrawal chart uses real earnings trend rows', () => {
  it('CRIT-113 - the rendered chart reflects server dates and earnings, not wallet-balance math', async () => {
    renderWithQuery(<WithdrawScreen />);

    await waitFor(() => expect(screen.getByLabelText('Earnings chart for 2 days, total ₱300.00')).toBeTruthy());
    expect(screen.getByLabelText('2026-08-30: ₱100.00')).toBeTruthy();
    expect(screen.getByLabelText('2026-08-31: ₱200.00')).toBeTruthy();
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/providers/me/earnings/trends?period=daily&days=7');
    expect(screen.queryByLabelText(/7 days, total ₱1,000.00/)).toBeNull();
  });
});
