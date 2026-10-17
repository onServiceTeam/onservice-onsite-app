// Customer review 2026-10-18, Suki hidden (D41 Q33 option a), P2 fix round:
// while the server's Suki switch is off, the server takes no Suki discount
// from any price. The Service Provider's repeat-customer list must not say
// otherwise: no "% off" badge on a customer, and no line promising customers
// a discount. The list itself, and opening a client record, still work.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true, isDesktop: false }) }));
jest.mock('@/services/suki.service', () => ({
  getProviderSukiCustomers: jest.fn().mockResolvedValue([
    {
      id: 'suki-1', customerId: 'customer-1', customerName: 'Ana Reyes', totalBookings: 12,
      totalSpent: 1200000, tier: 'super_suki', discount: 10, lastBookingAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'suki-2', customerId: 'customer-2', customerName: 'Juan dela Cruz', totalBookings: 6,
      totalSpent: 540000, tier: 'suki', discount: 5, lastBookingAt: null,
    },
  ]),
}));

import ProviderSukiCustomersScreen from '../app/provider/suki-customers';

it('Bug CR-299 — with the Suki switch off, the Service Provider repeat-customer list shows no "% off" badge or discount promise', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { success: true, data: { sukiProgramEnabled: false, referralProgramEnabled: false } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ProviderSukiCustomersScreen /></QueryClientProvider>);

  expect(await screen.findByText('Ana Reyes')).toBeTruthy();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)));

  expect(screen.getByText('Juan dela Cruz')).toBeTruthy();
  expect(container.textContent).not.toMatch(/% off/);
  expect(container.textContent).not.toMatch(/discount/i);
  expect(screen.getByText('Customers who book you more than once appear here.')).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Open Ana Reyes client record'));
  expect(mockPush).toHaveBeenCalledWith('/provider/clients/customer-1');
});
