import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 } }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockCancelChange = jest.fn().mockResolvedValue({ status: 'cancelled' });
jest.mock('@/services/service-area.service', () => ({
  getProviderServiceAreaState: jest.fn().mockResolvedValue({
    currentArea: { id: 'area-1', name: 'Mandaue', city: 'Mandaue', province: 'Cebu', centerLat: 10.3236, centerLng: 123.9223 },
    currentRadiusKm: 15, currentLatitude: 10.3236, currentLongitude: 123.9223, maxRadiusKm: 30,
    latestChange: {
      id: 'change-1', providerId: 'user-1', currentAreaId: 'area-1', requestedAreaId: 'area-2',
      currentRadiusKm: 15, requestedRadiusKm: 25, requestedLatitude: 10.3157,
      requestedLongitude: 123.8854, requestedCity: 'Cebu City', requestedProvince: 'Cebu',
      reason: 'Moved workshop', status: 'pending', decisionReason: null,
      requestedAreaName: 'Cebu City', createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
    },
  }),
  getActiveServiceAreas: jest.fn().mockResolvedValue([]),
  requestProviderServiceAreaChange: jest.fn(),
  cancelProviderServiceAreaChange: () => mockCancelChange(),
}));

import ProviderServiceAreaScreen from '../app/provider/service-area';

it('Bug UX-270 — the provider can confirm withdrawal of a pending request while keeping approved coverage', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderServiceAreaScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Pending admin review')).toBeTruthy();
  expect(screen.getByText(/current coverage remains active until approval/i)).toBeTruthy();
  fireEvent.click(screen.getByText('Withdraw request'));
  expect(screen.getByText('Withdraw service-area request?')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Withdraw request'));
  await waitFor(() => expect(mockCancelChange).toHaveBeenCalledTimes(1));
});
