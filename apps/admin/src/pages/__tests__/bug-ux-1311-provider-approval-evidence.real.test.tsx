import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { VETTING_ITEMS } from '@/components/VettingChecklist';
import { ApprovalPanel, type ProviderProfile } from '../ProviderDetailPage';
import ProvidersPage from '../ProvidersPage';
import { base, providerId, revisionId, decisionIndex, decisionDetail } from './helpers/provider-decision-fixture';

const queue = { data: { success: true,
  data: [{ id: providerId, fullName: 'Application fixture', phone: 'Masked contact', status: 'pending', tier: 'new', rating: 0, createdAt: '2026-09-05' }],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
} };
const envelope = (data: unknown) => Promise.resolve({ data: { success: true, data } });

it('Bug UX-1311 — both approval screens require matching pending submitted evidence and all four original document references', async () => {
  for (const surface of ['detail', 'queue'] as const) {
    const confirmLabel = surface === 'detail' ? 'Approve provider' : 'Confirm';
    const mount = async (load: () => Promise<unknown>, listing: unknown = decisionIndex) => {
      vi.mocked(api.get).mockReset(); vi.mocked(api.put).mockClear();
      vi.mocked(api.get).mockImplementation(path => (path === '/api/v1/admin/providers' ? Promise.resolve(queue)
        : path === `${base}?limit=20` ? envelope(listing) : load()) as never);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(<QueryClientProvider client={client}><MemoryRouter>
        {surface === 'detail' ? <ApprovalPanel profile={{ id: providerId, status: 'pending' } as ProviderProfile} /> : <ProvidersPage />}
      </MemoryRouter></QueryClientProvider>);
      fireEvent.click(await screen.findByRole('button', { name: surface === 'detail' ? 'Review & approve' : 'Approve' }));
      return client;
    };
    const expectBlocked = () => {
      expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      expect(api.put).not.toHaveBeenCalled();
    };
    const fillReview = async () => {
      await screen.findByRole('checkbox', { name: VETTING_ITEMS[0]!.label });
      for (const item of VETTING_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Approval rationale' }), {
        target: { value: 'The complete application and identity evidence were reviewed.' },
      });
      await waitFor(() => expect(screen.getByRole('button', { name: confirmLabel })).toBeEnabled());
    };
    for (const key of Object.keys(decisionDetail.revision.documents)) for (const missing of [null, '   ']) {
      const client = await mount(() => envelope({ ...decisionDetail, revision: { ...decisionDetail.revision,
        documents: { ...decisionDetail.revision.documents, [key]: missing } } }));
      await screen.findByRole('alert'); expectBlocked(); cleanup(); client.clear();
    }
    for (const record of [
      { ...decisionDetail, revision: { ...decisionDetail.revision, documents: undefined } },
      { ...decisionDetail, providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      { ...decisionDetail, revision: { ...decisionDetail.revision, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
      { ...decisionDetail, currentStatus: 'approved' },
      { ...decisionDetail, decisionContractVersion: undefined },
    ]) {
      const client = await mount(() => envelope(record));
      await screen.findByRole('alert'); expectBlocked(); cleanup(); client.clear();
    }
    for (const listing of [
      { ...decisionIndex, historyState: 'not_recorded', revisions: [] },
      { ...decisionIndex, decisionContractVersion: undefined },
      { ...decisionIndex, providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ]) {
      const client = await mount(() => envelope(decisionDetail), listing);
      await screen.findByRole('alert'); expectBlocked(); cleanup(); client.clear();
    }

    let finish!: (result: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    const client = await mount(() => pending);
    await screen.findByText('Loading submission 1...'); expectBlocked();
    await act(async () => finish({ data: { success: true, data: decisionDetail } }));
    await fillReview();
    let finishRefresh!: (result: unknown) => void;
    const refresh = new Promise(resolve => { finishRefresh = resolve; });
    vi.mocked(api.get).mockImplementation(path => (path === `${base}?limit=20` ? envelope(decisionIndex) : refresh) as never);
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest submission and clear review' }));
    await screen.findByText('Loading submission 1...'); expectBlocked();
    await act(async () => finishRefresh({ data: { success: true, data: decisionDetail } }));
    expect(await screen.findByRole('textbox', { name: 'Approval rationale' })).toHaveValue('');
    expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
    await fillReview();
    vi.mocked(api.get).mockImplementation(path => (path === '/api/v1/admin/providers' ? Promise.resolve(queue)
      : envelope(path === `${base}?limit=20` ? decisionIndex : decisionDetail)) as never);
    fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(`/api/v1/admin/providers/${providerId}/approve`, expect.objectContaining({
      expectedRevisionId: revisionId, checklistConfirmed: true,
    }));
    cleanup(); client.clear();

    let failed = true;
    const retryClient = await mount(() => failed ? Promise.reject(new Error('private server failure')) : envelope(decisionDetail));
    await screen.findByRole('alert'); expectBlocked();
    expect(screen.queryByText('private server failure')).not.toBeInTheDocument();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
    await fillReview(); expect(api.put).not.toHaveBeenCalled(); cleanup(); retryClient.clear();
  }
}, 30000);
