import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTemplate = jest.fn().mockResolvedValue({ id: 'new-template' });

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([{
    id: 'service-row', subcategoryId: 'subcategory-1', subcategoryName: 'Aircon Deep Clean',
    categoryId: 'category-1', pricingType: 'quote', basePrice: null, isActive: true,
  }]),
}));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  deleteTemplate: jest.fn(),
}));

import QuoteTemplatesScreen from '../app/provider/quote-templates';

it('Bug UX-281 — provider creates a service-linked template with validated centavo line items in the desktop editor', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteTemplatesScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop provider quote template workspace')).toBeTruthy();
  fireEvent.click(screen.getByText('+ New'));
  fireEvent.click(await screen.findByText('Aircon Deep Clean'));
  fireEvent.change(screen.getByPlaceholderText(/Template name/i), { target: { value: 'Aircon standard' } });
  fireEvent.change(screen.getByPlaceholderText(/Item \(e\.g\. Coil clean\)/i), { target: { value: 'Coil clean' } });
  fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '500' } });
  fireEvent.click(screen.getByText('+ Add item'));
  fireEvent.click(screen.getByText('Save template'));

  await waitFor(() => expect(mockCreateTemplate).toHaveBeenCalledWith({
    name: 'Aircon standard',
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    items: [{ description: 'Coil clean', quantity: 1, unit: 'unit', unitPrice: 50000, itemType: 'labor' }],
  }));
});
