import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import ProvidersPage from '../ProvidersPage';
import { ApprovalPanel, ProviderHeader, type ProviderProfile } from '../ProviderDetailPage';
import { VETTING_ITEMS } from '@/components/VettingChecklist';
import { base, index, json, providerId, revision, revisionId, signIn } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Bug UX-1378 — the queue and Provider 360 send the exact displayed submission ID on both approval and rejection', async () => {
  for (const surface of ['queue', 'detail']) for (const decision of ['approve', 'reject']) {
    signIn();
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    const profile: ProviderProfile = { id: providerId, userId: 'synthetic-owner', status: 'pending', tier: 'new',
      businessName: 'Current profile is not submitted evidence', description: '', averageRating: 0, totalReviews: 0,
      totalJobsCompleted: 0, serviceRadiusKm: 25, yearsExperience: null, vettingAnswers: null,
      city: null, province: null, latitude: null, longitude: null, createdAt: revision.submittedAt, updatedAt: revision.submittedAt,
      user: { id: 'synthetic-owner', fullName: 'Synthetic applicant', phone: '', avatarUrl: null, email: null,
        contactMasked: true, isVerified: true, isActive: true, lastLoginAt: null },
      documents: { nbiClearanceUrl: null, nbiExpiryDate: null, nbiExpiryNotified: false, avatarUrl: null,
        governmentIdUrl: null, governmentIdBackUrl: null, selfieUrl: null },
      categories: [], serviceAreas: [], certifications: [], portfolio: [],
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        writes.push({ url, body: JSON.parse(String(init.body)) });
        return json({ message: 'Saved synthetic decision' });
      }
      if (url === `${base}?limit=20`) return json({ ...index, currentStatus: 'pending' });
      if (url === `${base}/${revisionId}`) return json({ providerId, currentStatus: 'pending', revision, decisionContractVersion: 1, decision: null });
      if (url.startsWith('/api/v1/admin/providers?')) return new Response(JSON.stringify({ success: true,
        data: [{ ...profile, fullName: 'Synthetic applicant', phone: '', rating: 0, totalJobs: 0 }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), { headers: { 'Content-Type': 'application/json' } });
      return json(null, 404);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><MemoryRouter>
      {surface === 'queue' ? <ProvidersPage /> : decision === 'approve' ? <ApprovalPanel profile={profile} /> : <ProviderHeader profile={profile} />}
    </MemoryRouter></QueryClientProvider>);
    try {
      fireEvent.click(await screen.findByRole('button', { name: surface === 'queue' ? decision === 'approve' ? 'Approve' : 'Reject'
        : decision === 'approve' ? 'Review & approve' : 'Reject application' }));
      await screen.findByRole('region', { name: 'Submission 1 as submitted' });
      expect(screen.getByText(revision.businessName)).toBeVisible();
      const confirm = screen.getByRole('button', { name: surface === 'queue' ? 'Confirm'
        : decision === 'approve' ? 'Approve provider' : 'Reject reviewed submission' });
      expect(confirm).toBeDisabled();
      if (decision === 'approve') for (const item of VETTING_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
      const reason = 'Reviewed original evidence and recorded the decision basis.';
      fireEvent.change(screen.getByRole('textbox', { name: decision === 'approve' ? 'Approval rationale' : 'Rejection reason' }),
        { target: { value: reason } });
      await waitFor(() => expect(confirm).toBeEnabled());
      fireEvent.click(confirm);
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toMatchObject({ url: `/api/v1/admin/providers/${providerId}/${decision}`,
        body: { expectedRevisionId: revisionId, reason } });
      if (decision === 'approve') expect(writes[0]!.body.checklistConfirmed).toBe(true);
    } finally { view.unmount(); client.clear(); }
  }
});
