import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import api from '@/lib/api';
import FeedbackPage from '../FeedbackPage';

export const feedbackRecord = {
  id: 'feedback-1',
  createdAt: '2026-06-30T08:00:00.000Z',
  updatedAt: '2026-06-30T08:00:00.000Z',
  testerName: 'Customer tester',
  testerContact: 'c•••@example.com',
  contactMasked: true,
  piiMasked: true,
  role: 'customer',
  device: 'Desktop Chrome',
  areas: ['customer', 'admin'],
  nps: 4,
  summary: 'Payment redirect left the customer stuck.',
  itemCount: 1,
  payload: {
    items: [{
      area: 'customer',
      type: 'bug',
      severity: 'major',
      what: 'Wallet top-up did not return to the app.',
      where: 'Customer wallet',
      repro: 'Choose QR and complete payment.',
      expected: 'Return to the wallet with a clear status.',
      screenshots: ['/uploads/feedback/evidence.png'],
    }],
    ratings: { 'customer:payment_method_felt_safe': 2 },
    answers: { 'customer:if_something_went_wrong': 'I could not find help.' },
    prices: { 'cleaning:pricey': 1000 },
    ideas: 'Explain payment method status.',
    screenshots: [],
  },
  status: 'new' as const,
  assignedAdminId: null,
  assignedAdminName: null,
  triageNote: null,
};

export async function getFeedbackFixture(url: string): Promise<never> {
    if (url === '/api/v1/admin/feedback') {
      return {
        data: {
          success: true,
          data: {
            submissions: [{ ...feedbackRecord, payload: {} }],
            total: 1,
            page: 1,
            pageSize: 25,
            counts: { new: 10, triaged: 0, done: 0, dismissed: 0 },
          },
        },
      } as never;
    }
    if (url === '/api/v1/admin/feedback/feedback-1') {
      return { data: { success: true, data: feedbackRecord } } as never;
    }
    if (url === '/api/v1/admin/feedback/feedback-1/history') {
      return {
        data: {
          success: true,
          data: {
            entries: [{
              id: 'audit-1',
              createdAt: '2026-07-01T08:00:00.000Z',
              adminName: 'Ana Reyes',
              adminRole: 'admin',
              previousStatus: 'new',
              nextStatus: 'triaged',
              previousOwnerName: null,
              nextOwnerName: 'Ana Reyes',
              note: 'Verified the payment return problem and assigned the checkout fix.',
            }],
          },
        },
      } as never;
    }
    if (url === '/api/v1/support-tickets/agents') {
      return { data: { success: true, data: [{ id: 'agent-1', first_name: 'Ana', last_name: 'Reyes', role: 'admin' }] } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
}

export function mockFeedbackApi(): void {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.get).mockImplementation(getFeedbackFixture);
  vi.mocked(api.patch).mockResolvedValue({
    data: {
      success: true,
      data: { ...feedbackRecord, status: 'triaged', assignedAdminId: 'agent-1', assignedAdminName: 'Ana Reyes' },
    },
  } as never);
}

export function renderFeedbackPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><FeedbackPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}
