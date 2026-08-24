import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ q: 'clean' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import SearchScreen from '../app/customer/search';

it('Bug UX-273 — customer search uses the live admin catalog and sends applied category/rating filters from the wide workspace', async () => {
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog') {
      return { data: { success: true, data: [{ id: 'cat-1', name: 'Admin Aircon', slug: 'admin-aircon', description: '', iconUrl: null, displayOrder: 1 }] } };
    }
    return { data: { success: true, data: { services: [], providers: [] } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SearchScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop customer search workspace')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Open search filters'));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Admin Aircon' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '4.5 and up' }));
  fireEvent.click(screen.getByLabelText('Apply filters'));

  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith('/api/v1/catalog/search', {
      params: { q: 'clean', limit: 30, categories: 'admin-aircon', minRating: '4.5' },
    });
  });
});
