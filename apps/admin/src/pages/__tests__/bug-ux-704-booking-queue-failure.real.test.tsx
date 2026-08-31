import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import BookingsPage from '../BookingsPage';

it('Bug UX-704 — booking operations failure is unavailable with retry instead of six false zero queue signals', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('Booking operations unavailable'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><BookingsPage /></QueryClientProvider>);

  expect(await screen.findByText('Booking queue signals and rows could not be loaded. No zero counts are being inferred.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry booking operations' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Booking queue signals' })).toBeNull();
});
