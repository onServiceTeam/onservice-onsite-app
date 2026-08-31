import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CancellationPolicyPage from '../settings/CancellationPolicyPage';

const tiers = [
  { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '24+ hours before' },
  { min_hours_before: 4, max_hours_before: 24, refund_percent: 75, fee_percent: 25, label: '4-24 hours before' },
  { min_hours_before: 0, max_hours_before: 4, refund_percent: 50, fee_percent: 50, label: 'under 4 hours' },
  { min_hours_before: -999, max_hours_before: 0, refund_percent: 0, fee_percent: 100, label: 'after scheduled time / no-show' },
];

it('Bug UX-798 — support admins compare actual refunds with customer wording without unsafe edit controls', async () => {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/cancellation-policies') {
      return { data: { data: [{
        id: 'policy-3', version: 3, effective_from: '2026-08-01T00:00:00.000Z', effective_to: null,
        is_active: true, created_at: '2026-08-01T00:00:00.000Z', creator_name: 'Ken M', tier_count: 4,
        provider_no_show_credit_php: 200, intro_text_preview: 'Cancel anytime.',
      }] } };
    }
    if (url === '/api/v1/admin/cancellation-policies/3') {
      return { data: { data: {
        id: 'policy-3', version: 3, effective_from: '2026-08-01T00:00:00.000Z', effective_to: null,
        is_active: true, tiers, intro_text: 'Cancel anytime.', legal_disclaimer: 'Display disclaimer.',
        provider_no_show_credit_php: 200, created_at: '2026-08-01T00:00:00.000Z', created_by: null,
        creator_name: 'Ken M',
      } } };
    }
    if (url === '/api/v1/admin/settings/cancellation') {
      const values: Record<string, string> = {
        cancel_refund_over_24h: '100', cancel_refund_2_to_24h: '100', cancel_refund_1_to_2h: '90',
        cancel_refund_30min_to_1h: '80', cancel_refund_under_30min: '70',
        cancel_refund_provider_arrived: '50', cancel_refund_customer_noshow: '0',
      };
      return { data: { data: Object.entries(values).map(([key, value]) => ({
        key, label: key, value, unit: '%', runtimeStatus: 'held', runtimeLabel: 'Launch hold',
        runtimeSummary: 'Frozen under E09.', editable: false,
      })) } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CancellationPolicyPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('E09 money-policy mismatch: changes are frozen');
  expect(screen.getByText('System A: actual refund engine')).toBeInTheDocument();
  expect(screen.getByText('System B: customer-displayed policy v3')).toBeInTheDocument();
  expect(screen.getByLabelText('2 to 24 hours before actual refund rule')).toHaveTextContent('100% refund');
  expect(screen.getByLabelText('4-24 hours before customer-displayed refund rule')).toHaveTextContent('75% refund');
  expect(screen.getByText('View setting history').closest('a')).toHaveAttribute('href', '/settings?category=cancellation');
  expect(screen.queryByRole('button', { name: /Save|Edit|Publish/i })).not.toBeInTheDocument();
});
