import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: { put, get },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

put.mockResolvedValue({ data: { success: true } });

import { ApprovalPanel, type ProviderProfile } from '../ProviderDetailPage';
import { VETTING_ITEMS, buildChecklistSummary } from '@/components/VettingChecklist';

it('Bug UX-433 — provider approval sends the completed checklist and rationale in the approval request', async () => {
  get.mockResolvedValue({ data: { success: true, data: {
    id: 'provider-1', status: 'pending', documents: {
      governmentIdUrl: '/private/front', governmentIdBackUrl: '/private/back',
      selfieUrl: '/private/selfie', nbiClearanceUrl: '/private/nbi',
    },
  } } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <ApprovalPanel profile={{ id: 'provider-1' } as ProviderProfile} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Review & approve' }));
  await screen.findByRole('checkbox', { name: 'Government ID front and back reviewed and legible' });
  for (const item of VETTING_ITEMS) {
    fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
  }
  fireEvent.change(screen.getByRole('textbox', { name: 'Approval rationale' }), {
    target: { value: 'Identity, qualifications, service scope, and references were verified.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Approve provider' }));

  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/api/v1/admin/providers/provider-1/approve', {
      reason: 'Identity, qualifications, service scope, and references were verified.',
      checklistConfirmed: true,
      checklistSummary: buildChecklistSummary(),
    }),
  );
});
