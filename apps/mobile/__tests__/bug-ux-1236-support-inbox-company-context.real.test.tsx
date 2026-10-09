import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1236', role: 'customer' } }),
}));
jest.mock('@/services/support.service', () => {
  const actual = jest.requireActual('@/services/support.service');
  return {
    ...actual,
    listMyTickets: jest.fn().mockResolvedValue({
      tickets: [{
        id: '12360000-abcd-4abc-8def-000000001236', ticket_number: 'TKT-1236',
        type: 'general_inquiry', status: 'open', priority: 'medium', subject: 'Company support case',
        description: 'Please help our company.', booking_id: null, project_id: null,
        related_business_account_id: '12360000-abcd-4abc-8def-000000001237',
        business_account_name: 'Cebu Build Co', business_account_status: 'active',
        created_at: '2026-09-04T01:00:00.000Z', updated_at: '2026-09-04T01:00:00.000Z',
        message_count: '0',
      }],
      total: 1, page: 1, limit: 20,
    }),
  };
});

import SupportInboxScreen from '../app/support/index';

it('Bug UX-1236 - the participant Support inbox identifies the Business Account attached by the server', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportInboxScreen /></QueryClientProvider>);

  expect(await screen.findByText('Company support case')).toBeTruthy();
  expect(screen.getByText('Company: Cebu Build Co')).toBeTruthy();
});
