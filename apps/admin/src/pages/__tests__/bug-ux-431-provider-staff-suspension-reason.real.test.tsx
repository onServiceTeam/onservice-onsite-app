import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

get.mockResolvedValue({
  data: {
    success: true,
    data: [
      {
        id: 'staff-1',
        userId: 'user-1',
        userName: 'Ramil Santos',
        roleTitle: 'Aircon technician',
        status: 'approved',
        invitePhone: '+639170000001',
        inviteEmail: null,
        adminDecisionReason: null,
        isAssignable: true,
        createdAt: '2026-08-30T01:00:00.000Z',
        performance: { totalJobs: 4, totalReviews: 3, averageRating: 4.8 },
      },
    ],
  },
});
post.mockResolvedValue({ data: { success: true } });

import { StaffTab } from '../ProviderDetailPage';

it('Bug UX-431 — provider-staff suspension requires a reason and states the current-job access impact', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <StaffTab providerId="provider-1" />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(screen.getByText(/blocks this member from opening or updating assigned jobs/i)).toBeTruthy();
  const suspendButton = screen.getByRole('button', { name: 'Suspend member' });
  expect(suspendButton).toBeDisabled();

  fireEvent.change(screen.getByRole('textbox', { name: 'Suspension reason' }), {
    target: { value: 'Support case OS-482 documents an identity mismatch.' },
  });
  fireEvent.click(suspendButton);

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/v1/admin/providers/provider-1/staff/staff-1/suspend',
      {
        suspend: true,
        reason: 'Support case OS-482 documents an identity mismatch.',
      },
    ),
  );
  confirmSpy.mockRestore();
});
