import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { ReferralsTab } from '../CustomerDetailPage';

it('Bug UX-1281 - a failed Customer 360 referral read offers recovery without showing no referral activity', async () => {
  apiGet.mockRejectedValueOnce(new Error('customer referrals source offline')).mockResolvedValueOnce({ data: { success: true, data: {
    ownCodes: [], given: [], received: null, totalEarnedFromReferrals: 0, totalReferrals: 0,
    creditedReferrals: 0, pendingReferrals: 0,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ReferralsTab customerId="customer-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Customer referrals unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as no referral activity/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer referrals' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No referral codes yet.')).toBeInTheDocument();
});
