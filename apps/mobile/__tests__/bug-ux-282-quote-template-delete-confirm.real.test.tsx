import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDeleteTemplate = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({ getMyServices: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockResolvedValue([{
    id: 'template-1', name: 'General repair', categoryId: null, subcategoryId: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    items: [{ id: 'item-1', description: 'Labor', quantity: 1, unit: 'unit', unitPrice: 50000, itemType: 'labor', sortOrder: 0 }],
  }]),
  createTemplate: jest.fn(),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
}));

import QuoteTemplatesScreen from '../app/provider/quote-templates';

it('Bug UX-282 — quote-template deletion requires explicit confirmation and reports the scoped delete', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteTemplatesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByLabelText('Delete General repair'));
  expect(screen.getByText('Delete quote template?')).toBeTruthy();
  expect(mockDeleteTemplate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Delete template'));

  await waitFor(() => expect(mockDeleteTemplate).toHaveBeenCalledWith('template-1'));
});
