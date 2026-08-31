import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], pagination: { total: 0 } } }) },
}));

import RecurringListScreen from '../app/customer/recurring/index';

it('Bug UX-645 — the recurring empty state does not promise automatic jobs or charges while recurring payment is held', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringListScreen /></QueryClientProvider>);

  expect(await screen.findByText(/each visit is reviewed and paid separately/i)).toBeTruthy();
  expect(screen.queryByText(/repeat automatically/i)).toBeNull();
});
