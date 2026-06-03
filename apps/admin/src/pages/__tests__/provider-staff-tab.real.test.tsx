// D23 — real render + interaction test for the provider-detail Staff tab.
// Mounts StaffTab with a stubbed api, asserts it renders a pending-review
// member with the right review actions, and that clicking Approve POSTs the
// review decision to the correct endpoint.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// vi.mock is hoisted above module init, so the spies must be created with
// vi.hoisted (also hoisted) to be referenceable inside the factory.
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

get.mockResolvedValue({
  data: {
    success: true,
    data: [
      {
        id: 'staff-1',
        userId: null,
        userName: null,
        roleTitle: 'Aircon technician',
        status: 'pending_review',
        invitePhone: '+639170000001',
        inviteEmail: null,
        adminDecisionReason: null,
        isAssignable: false,
        createdAt: new Date('2026-06-01T00:00:00Z').toISOString(),
        performance: { totalJobs: 0, totalReviews: 0, averageRating: 0 },
      },
    ],
  },
});
post.mockResolvedValue({ data: { success: true } });

import { StaffTab } from '../ProviderDetailPage';

function withProviders(child: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return React.createElement(QueryClientProvider, { client }, child);
}

beforeEach(() => {
  post.mockClear();
});

describe('Provider detail — Staff tab (D23)', () => {
  it('renders a pending-review member with their role and review actions', async () => {
    const { container, findByText } = render(withProviders(<StaffTab providerId="prov-1" />));
    expect(await findByText('Aircon technician')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('pending review');
    expect(text).toContain('+639170000001');
    // The three review actions are present for a pending member.
    expect(text).toContain('Approve');
    expect(text).toContain('Send back');
    expect(text).toContain('Reject');
  });

  it('fetches staff from the provider-scoped endpoint', async () => {
    render(withProviders(<StaffTab providerId="prov-42" />));
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/v1/admin/providers/prov-42/staff');
    });
  });

  it('Approve POSTs the approved decision to the review endpoint', async () => {
    const { findByText } = render(withProviders(<StaffTab providerId="prov-1" />));
    const approveBtn = await findByText('Approve');
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/v1/admin/providers/prov-1/staff/staff-1/review',
        expect.objectContaining({ decision: 'approved' }),
      );
    });
  });
});
