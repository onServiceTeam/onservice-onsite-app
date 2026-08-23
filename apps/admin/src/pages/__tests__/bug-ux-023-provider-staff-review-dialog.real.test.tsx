import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));

get.mockResolvedValue({
  data: {
    success: true,
    data: [{
      id: 'staff-1', userId: null, userName: 'Ramil S.', roleTitle: 'Technician',
      status: 'pending_review', invitePhone: '+639170000001', inviteEmail: null,
      adminDecisionReason: null, isAssignable: false, createdAt: '2026-08-23T00:00:00.000Z',
      performance: { totalJobs: 0, totalReviews: 0, averageRating: 0 },
    }],
  },
});
post.mockResolvedValue({ data: { success: true } });

import { StaffTab } from '../ProviderDetailPage';

it('Bug UX-023 — provider team rejection uses an auditable in-page reason dialog instead of a browser prompt', async () => {
  const promptSpy = vi.spyOn(window, 'prompt');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><StaffTab providerId="provider-1" /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Reject'));
  expect(promptSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Reject team member' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Provider team review reason'), {
    target: { value: 'Identity document could not be verified.' },
  });
  fireEvent.click(screen.getByText('Reject member'));

  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/staff/staff-1/review',
    { decision: 'rejected', reason: 'Identity document could not be verified.' },
  ));
  promptSpy.mockRestore();
});
