import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { REQUIRED_APPROVAL_DOCUMENTS } from '@/components/ProviderApprovalReview';
import { VETTING_ITEMS } from '@/components/VettingChecklist';
import { ApprovalPanel, type ProviderProfile } from '../ProviderDetailPage';
import ProvidersPage from '../ProvidersPage';

const providerId = '78ed2c52-1a69-49d1-8b51-b5fd51ae5ffe';
const documents = {
  governmentIdUrl: '/private/front', governmentIdBackUrl: '/private/back',
  selfieUrl: '/private/selfie', nbiClearanceUrl: '/private/nbi',
};
const complete = { id: providerId, status: 'pending', documents };
const queue = { data: {
  success: true,
  data: [{ id: providerId, fullName: 'Application fixture', phone: 'Masked contact', status: 'pending', tier: 'new', rating: 0, createdAt: '2026-09-05' }],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
} };

it('Bug UX-1311 — both admin approval screens require a current matching pending application with all four documents', async () => {
  for (const surface of ['detail', 'queue'] as const) {
    const confirmLabel = surface === 'detail' ? 'Approve provider' : 'Confirm';
    const mount = async (load: () => Promise<unknown>) => {
      vi.mocked(api.get).mockReset();
      vi.mocked(api.put).mockClear();
      vi.mocked(api.get).mockImplementation((path) =>
        (path === '/api/v1/admin/providers' ? Promise.resolve(queue) : load()) as never,
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(<QueryClientProvider client={client}><MemoryRouter>
        {surface === 'detail'
          ? <ApprovalPanel profile={{ id: providerId, status: 'pending', documents } as ProviderProfile} />
          : <ProvidersPage />}
      </MemoryRouter></QueryClientProvider>);
      fireEvent.click(await screen.findByRole('button', { name: surface === 'detail' ? 'Review & approve' : 'Approve' }));
      return client;
    };
    const envelope = (record: unknown) => Promise.resolve({ data: { success: true, data: record } });
    const expectBlocked = () => {
      expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      expect(api.put).not.toHaveBeenCalled();
    };
    const fillReview = async () => {
      await screen.findByRole('checkbox', { name: 'Government ID front and back reviewed and legible' });
      for (const item of VETTING_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Approval rationale' }), {
        target: { value: 'The complete application and identity evidence were reviewed.' },
      });
      await waitFor(() => expect(screen.getByRole('button', { name: confirmLabel })).toBeEnabled());
    };

    for (const document of REQUIRED_APPROVAL_DOCUMENTS) {
      for (const missing of [null, '   ']) {
        const client = await mount(() => envelope({ ...complete, documents: { ...documents, [document.key]: missing } }));
        await screen.findByText(/All four required documents must be on file/);
        const row = screen.getByText(document.label).closest('li')!;
        expect(within(row).getByText('Missing')).toBeVisible();
        expect(screen.getByRole('link', { name: 'Open full application and documents' })).toHaveAttribute('href', `/providers/${providerId}?tab=profile`);
        expectBlocked();
        cleanup(); client.clear();
      }
    }
    for (const record of [{ ...complete, documents: undefined }, { ...complete, id: 'another-provider' }, { ...complete, status: 'approved' }]) {
      const client = await mount(() => envelope(record));
      await screen.findByRole('alert');
      expectBlocked();
      cleanup(); client.clear();
    }

    let finish!: (result: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    const client = await mount(() => pending);
    expect(screen.getByText('Checking current application documents...')).toBeVisible();
    expectBlocked();
    await act(async () => { finish({ data: { success: true, data: complete } }); });
    await fillReview();

    // A refetch blocks approval even with a previously completed checklist.
    // Once fresh data returns, old attestations must not authorize a new review.
    let finishRefresh!: (result: unknown) => void;
    const refresh = new Promise(resolve => { finishRefresh = resolve; });
    vi.mocked(api.get).mockImplementation(() => refresh as never);
    let refreshed!: Promise<void>;
    act(() => { refreshed = client.invalidateQueries({ queryKey: ['admin-provider-approval-evidence', providerId] }); });
    await screen.findByText('Checking current application documents...');
    expectBlocked();
    await act(async () => { finishRefresh({ data: { success: true, data: complete } }); await refreshed; });
    await screen.findByRole('checkbox', { name: 'Government ID front and back reviewed and legible' });
    expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Approval rationale' })).toHaveValue('');
    await fillReview();
    // Restore the normal query response before approval invalidates the queue.
    vi.mocked(api.get).mockImplementation((path) => (path === '/api/v1/admin/providers' ? Promise.resolve(queue) : envelope(complete)) as never);
    fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(`/api/v1/admin/providers/${providerId}/approve`, expect.objectContaining({ checklistConfirmed: true }));
    cleanup(); client.clear();

    let failed = true;
    const retryClient = await mount(() => failed ? Promise.reject(new Error('private server failure')) : envelope(complete));
    await screen.findByText(/Application documents could not be checked/);
    expect(screen.queryByText('private server failure')).not.toBeInTheDocument();
    expectBlocked();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry document check' }));
    await fillReview();
    expect(api.put).not.toHaveBeenCalled();
    cleanup(); retryClient.clear();
  }
}, 30000);
