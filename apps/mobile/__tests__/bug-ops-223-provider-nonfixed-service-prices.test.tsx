import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([
    {
      id: 'hourly-1', providerId: 'provider-1', subcategoryId: 'subcategory-1',
      subcategoryName: 'Handyman labor', pricingType: 'hourly', basePrice: null,
      hourlyRate: 65000, isActive: true,
    },
    {
      id: 'unit-1', providerId: 'provider-1', subcategoryId: 'subcategory-2',
      subcategoryName: 'Aircon units', pricingType: 'per_unit', basePrice: null,
      unitLabel: 'unit', unitPrice: 80000, isActive: true,
    },
    {
      id: 'quote-1', providerId: 'provider-1', subcategoryId: 'subcategory-3',
      subcategoryName: 'Custom renovation', pricingType: 'quote', basePrice: null,
      isActive: true,
    },
  ]),
  addService: jest.fn(),
  removeService: jest.fn(),
}));

import ManageServicesScreen from '../app/provider/services';

it('Bug OPS-223 — provider services show catalog hourly, per-unit, and quote pricing honestly', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ManageServicesScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('Handyman labor'));
  expect(container.textContent).toContain('Customer price ₱650.00/hour');
  expect(container.textContent).toContain('Customer price ₱800.00/unit');
  expect(container.textContent).toContain('Quote after assessment');
  expect(container.textContent).not.toContain('Quote required');
});
