import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import CustomerDetailPage, { CustomerHeader } from '../../CustomerDetailPage';

export const firstCustomerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const secondCustomerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
type Profile = React.ComponentProps<typeof CustomerHeader>['profile'];
export const customerPayments = { walletAvailable: 0, walletPending: 0,
  recentTransactions: [], recentPaymentIntents: [], paymentMethodCounts: {} };
export const customerDisputes = { rows: [], total: 0, page: 1, pageSize: 20,
  fraudPattern: { disputesInWindow: 3, windowDays: 30, favorProviderRate: null,
    flagged: true, reason: 'Synthetic pattern needing human review' } };

function profile(id: string, name: string, suffix: string): Profile {
  return { id, firstName: 'Synthetic', lastName: name, fullName: `Synthetic ${name}`,
    phone: `+63918****${suffix}`, email: null, contactMasked: true, avatarUrl: null,
    isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z', lifetimeBookings: 0, lifetimeSpent: 0,
    activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0,
    addresses: [], sukiProviders: [] };
}

export function mountCustomerRecords(tab = 'profile'): {
  client: QueryClient;
  router: ReturnType<typeof createMemoryRouter>;
  first: Profile;
  second: Profile;
  close: () => void;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } });
  const first = profile(firstCustomerId, 'Alpha Customer', '111');
  const second = profile(secondCustomerId, 'Beta Customer', '222');
  for (const item of [first, second]) {
    client.setQueryData(['admin-customer-profile', item.id], item);
    client.setQueryData(['admin-customer-payments', item.id, ''], customerPayments);
    client.setQueryData(['admin-customer-disputes', item.id, 1], customerDisputes);
  }
  const router = createMemoryRouter([{ path: '/customers/:id', element: <CustomerDetailPage /> }], {
    initialEntries: [`/customers/${first.id}?tab=${tab}`],
  });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { client, router, first, second, close: () => { view.unmount(); router.dispose(); client.clear(); } };
}
