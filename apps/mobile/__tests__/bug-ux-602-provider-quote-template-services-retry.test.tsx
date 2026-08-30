import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMyServices } from '@/services/provider-api.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockResolvedValue([]), createTemplate: jest.fn(), deleteTemplate: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockRejectedValue(new Error('services unavailable')),
}));

import QuoteTemplatesScreen from '../app/provider/quote-templates';

it('Bug UX-602 — failed quote-template service choices have a direct desktop retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteTemplatesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('+ New'));
  expect(await screen.findByText(/Your services could not be loaded/i)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading services' }));
  await waitFor(() => expect(getMyServices).toHaveBeenCalledTimes(2));
});
