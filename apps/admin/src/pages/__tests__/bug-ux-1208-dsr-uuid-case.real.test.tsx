import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const DSR_ID = '12080000-abcd-4abc-8def-000000001208';
const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'dpo' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-1208 - an uppercase DSR UUID opens the canonical exact privacy case', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/admin/compliance/dsr/${DSR_ID}`) {
      return Promise.resolve({ data: { data: {
        id: DSR_ID,
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userEmail: 'subject@example.test',
        userRole: 'customer',
        providerProfileId: null,
        requestType: 'correction',
        status: 'in_progress',
        receivedAt: '2026-09-01T00:00:00.000Z',
        dueAt: '2026-09-16T00:00:00.000Z',
        completedAt: null,
        handledBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        handledByName: 'Privacy Officer',
        handledByEmail: 'privacy@onservice.ph',
        userMessage: 'Correct the retained surname.',
        adminNotes: 'Canonical exact case loaded.',
        responsePayloadUrl: null,
        rejectionReason: null,
        daysUntilDue: 12,
        isOverdue: false,
      } } });
    }
    if (url.startsWith('/api/v1/admin/compliance/dsr?')) {
      return Promise.resolve({ data: { data: { rows: [], total: 0 } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/data-protection-log?dsrId=${DSR_ID.toUpperCase()}`]}>
        <DataProtectionLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Privacy case 00001208' })).toBeVisible();
  expect(screen.getByText('Canonical exact case loaded.')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/compliance/dsr/${DSR_ID}`);
});
