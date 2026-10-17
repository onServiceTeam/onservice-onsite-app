// Customer review 2026-10-18, old fixed-price screens cleaned (D41 Q39 option
// a, finish-path-8): if request-first booking is ever switched off, the old
// hourly estimate must not promise a refund (refund rules wait on E09 and the
// attorney). The line is removed and nothing replaces it.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
// The old screen in the state it serves: request-first booking switched off.
jest.mock('@/hooks/useRequestFirstBooking', () => ({
  useRequestFirstBooking: () => false,
  useRequestFirstBookingState: () => ({ requestFirst: false, settled: true }),
}));

import ConfigureScreen from '../app/customer/booking/configure';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug CR-295 — the old hourly service screen makes no refund promise', () => {
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Aircon Services', 'aircon');
  useBookingStore.getState().setSubcategory('service-1', 'Aircon troubleshooting', 0, {
    hourlyRate: 70000, pricingType: 'hourly', description: 'Diagnosis of a unit that does not cool.',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ConfigureScreen /></QueryClientProvider>);

  expect(screen.getByText('How many hours do you estimate?')).toBeTruthy();
  expect(screen.getByText(/You authorize up to/)).toBeTruthy();
  expect(container.textContent).not.toMatch(/refund/i);
  expect(container.textContent).not.toMatch(/only charged for the actual time/i);
  // No em dash (U+2014) in the copy either (Ken's writing rule).
  expect(container.textContent).not.toContain('\u2014');
});
