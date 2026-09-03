import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: '12350000-abcd-4abc-8def-000000001235' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1235', role: 'customer' } }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: {
      id: '12350000-abcd-4abc-8def-000000001235', ticket_number: 'TKT-1235',
      type: 'general_inquiry', status: 'open', priority: 'medium', subject: 'Company account help',
      description: 'Please review this company context.', booking_id: null, project_id: null,
      related_business_account_id: '12350000-ABCD-4ABC-8DEF-000000001236',
      business_account_name: 'Cebu Build Co', business_account_status: 'active',
      created_at: '2026-09-04T01:00:00.000Z', updated_at: '2026-09-04T01:00:00.000Z', messages: [],
    } } }),
    post: jest.fn(),
  },
}));

import SupportThreadScreen, { getSupportBusinessAccountRoute } from '../app/support/[id]';

it('Bug UX-1235 - a customer Support thread opens its company account while provider personas receive no company route', async () => {
  expect(getSupportBusinessAccountRoute(
    'customer',
    '12350000-ABCD-4ABC-8DEF-000000001236',
  )).toBe('/customer/business/12350000-abcd-4abc-8def-000000001236');
  expect(getSupportBusinessAccountRoute('provider', '12350000-abcd-4abc-8def-000000001236')).toBeNull();
  expect(getSupportBusinessAccountRoute('provider_staff', '12350000-abcd-4abc-8def-000000001236')).toBeNull();

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  const companyAction = await screen.findByRole('button', { name: 'Open related company account' });
  expect(screen.getByText('Cebu Build Co')).toBeTruthy();
  fireEvent.click(companyAction);
  expect(mockPush).toHaveBeenCalledWith('/customer/business/12350000-abcd-4abc-8def-000000001236');
});
