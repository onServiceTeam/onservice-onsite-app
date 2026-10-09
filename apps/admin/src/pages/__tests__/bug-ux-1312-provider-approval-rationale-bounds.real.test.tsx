import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { VETTING_ITEMS } from '@/components/VettingChecklist';
import { ApprovalPanel, type ProviderProfile } from '../ProviderDetailPage';
import ProvidersPage from '../ProvidersPage';
import { providerId, revisionId, decisionResponse } from './helpers/provider-decision-fixture';

it('Bug UX-1312 — both provider approval surfaces bound the rationale to the API contract and associate validation guidance with the field', async () => {
  const profile = { id: providerId, status: 'pending', documents: {
    governmentIdUrl: '/private/front', governmentIdBackUrl: '/private/back',
    selfieUrl: '/private/selfie', nbiClearanceUrl: '/private/nbi',
  } };
  for (const surface of ['queue', 'detail'] as const) {
    vi.mocked(api.put).mockClear();
    vi.mocked(api.get).mockImplementation(path => Promise.resolve({ data: path === '/api/v1/admin/providers'
      ? { success: true, data: [{ ...profile, fullName: 'Test Applicant', phone: 'Masked contact', tier: 'new', rating: 0, createdAt: '2026-09-05' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
      : decisionResponse(path).data,
    }) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter>
      {surface === 'queue' ? <ProvidersPage /> : <ApprovalPanel profile={profile as ProviderProfile} />}
    </MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: surface === 'queue' ? 'Approve' : 'Review & approve' }));
    const rationale = await screen.findByRole('textbox', { name: 'Approval rationale' });
    const confirm = screen.getByRole('button', { name: surface === 'queue' ? 'Confirm' : 'Approve provider' });
    for (const item of VETTING_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
    expect(rationale).toHaveAttribute('maxlength', '2000');
    expect(rationale).toHaveAttribute('minlength', '10');
    expect(rationale).toHaveAttribute('aria-required', 'true');
    expect(rationale).toHaveAccessibleDescription('Use 10 to 2000 characters. 0/2000');
    expect(rationale).toHaveAttribute('aria-invalid', 'false');

    for (const invalid of ['', '   ', '123456789', 'x'.repeat(2001)]) {
      fireEvent.change(rationale, { target: { value: invalid } });
      fireEvent.blur(rationale);
      expect(rationale).toHaveAttribute('aria-invalid', 'true');
      expect(rationale).toHaveAccessibleDescription(expect.stringMatching(/characters required|Shorten the rationale/));
      expect(screen.getByRole('alert')).toBeVisible();
      expect(confirm).toBeDisabled();
      fireEvent.click(confirm);
      expect(api.put).not.toHaveBeenCalled();
    }
    for (const valid of ['1234567890', 'x'.repeat(2000), '  1234567890  ']) {
      fireEvent.change(rationale, { target: { value: valid } });
      expect(rationale).toHaveAttribute('aria-invalid', 'false');
      await waitFor(() => expect(confirm).toBeEnabled());
    }
    fireEvent.click(confirm);
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(`/api/v1/admin/providers/${providerId}/approve`, expect.objectContaining({ reason: '1234567890', checklistConfirmed: true, expectedRevisionId: revisionId }));
    cleanup(); client.clear();
  }
});
