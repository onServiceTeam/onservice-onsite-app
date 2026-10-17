// Customer review 2026-10-18, Suki hidden (D41 Q33 option a): while the
// server's Suki switch is off, the Suki screen shows only "Not available right
// now" with one button back: no points, no discount, no Redeem, and it asks
// the Suki service for nothing. P2 fix round: the header no longer names
// Suki while it is off.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetMemberships = jest.fn().mockResolvedValue([{
  id: 'm-1', customerId: 'c-1', providerId: 'provider-1', providerName: "Kuya Mike's Plumbing", tier: 'suki',
  totalBookings: 12, totalSpent: 1200000, pointsBalance: 900, lastBookingAt: null,
}]);
const mockGetTiers = jest.fn().mockResolvedValue([{ name: 'suki', minBookings: 10, pointsMultiplier: 2, discount: 5 }]);
jest.mock('expo-router', () => ({
  // No history (for example a reloaded web page): "Go back" goes Home.
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn(), canGoBack: () => false }),
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/suki.service', () => ({
  getMemberships: (...a: unknown[]) => mockGetMemberships(...a),
  getTiers: (...a: unknown[]) => mockGetTiers(...a),
  redeemPoints: jest.fn(),
}));

import SukiProsScreen from '../app/customer/suki-pros';

it('Bug CR-290 — with the Suki switch off, the Suki screen shows "Not available right now" and no points, discount or Redeem', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { success: true, data: { sukiProgramEnabled: false, referralProgramEnabled: false } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><SukiProsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Not available right now')).toBeTruthy();
  expect(container.textContent).not.toMatch(/₱|pts|% off|Redeem|Kuya Mike/);
  expect(container.textContent).not.toMatch(/Suki/);
  expect(mockGetMemberships).not.toHaveBeenCalled();
  expect(mockGetTiers).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Go back'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home'));
  expect(mockBack).not.toHaveBeenCalled();
});
