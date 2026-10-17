// Customer review 2026-10-18, old fixed-price bookings (D41 Q39 option a):
// while request-first booking is on, the old "Customize Your Service" screen
// is not used. A customer who still reaches it (an old link, a reloaded page)
// is sent to the request form, and no add-ons or prices are shown.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));

import ConfigureScreen from '../app/customer/booking/configure';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug CR-291 — with request-first booking on, the old service customization screen opens the request form', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { requestFirstBooking: true } } });
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ConfigureScreen /></QueryClientProvider>);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/customer/booking/job-request'));
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Opening the request form')).toBeTruthy();
  expect(container.textContent).not.toMatch(/₱|Price Summary/);
});
