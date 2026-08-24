import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([{
    id: 'service-1',
    providerId: 'provider-1',
    subcategoryId: 'subcategory-1',
    subcategoryName: 'General Cleaning',
    basePrice: 50000,
    isActive: true,
  }]),
  addService: jest.fn(),
  removeService: jest.fn(),
}));

import ManageServicesScreen from '../app/provider/services';

describe('OPS-214 — provider service pricing stays honest while E16 is open', () => {
  it('shows the catalog-price notice and no personal price editor', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      React.createElement(QueryClientProvider, { client }, React.createElement(ManageServicesScreen)),
    );

    await waitFor(() => expect(container.textContent).toContain('General Cleaning'));
    expect(container.textContent).toContain('Customer prices are set by the catalog');
    expect(container.textContent).toContain('General Cleaning');
    expect(container.textContent).not.toContain('Your Base Price');
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('button')).some((button) =>
      /Edit General Cleaning price/i.test(button.getAttribute('aria-label') ?? ''),
    )).toBe(false);
  });
});
