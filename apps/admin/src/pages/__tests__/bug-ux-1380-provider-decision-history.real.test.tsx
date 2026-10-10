import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { ProviderApprovalReview } from '@/components/ProviderApprovalReview';
import { base, index, json, providerId, revision, revisionId, signIn } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Bug UX-1380 — submission review shows its immutable decision instead of inferring one from current provider status', async () => {
  signIn();
  const decision = { id: '11111111-1111-4111-8111-111111111111', decidedBy: '22222222-2222-4222-8222-222222222222',
    decision: 'approved', reason: 'Original identity evidence and qualifications reviewed.',
    checklistSummary: 'Original complete checklist, recorded on this submission.', decidedAt: '2026-09-07T03:00:00.000Z' };
  let legacyServer = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === `${base}?limit=20`) return json({ ...index, currentStatus: 'pending',
      decisionContractVersion: legacyServer ? undefined : 1 });
    if (url === `${base}/${revisionId}`) return json({ providerId, currentStatus: 'pending', revision, decision,
      decisionContractVersion: 1 });
    return json(null, 404);
  }));
  const view = render(<ProviderApprovalReview providerId={providerId} onChange={vi.fn()} />);
  try {
    expect(await screen.findByRole('region', { name: 'Decision recorded for this submission' })).toHaveTextContent('approved');
    expect(screen.getByText(`Reason: ${decision.reason}`)).toBeVisible();
    expect(screen.getByText(decision.checklistSummary)).toBeVisible();
    expect(screen.getByText(decision.decidedBy)).toBeVisible();
    expect(screen.getByText(decision.id)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('already has a recorded decision');
    expect(screen.queryByRole('checkbox')).toBeNull();
    legacyServer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest submission and clear review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not support submission-bound decisions');
    expect(screen.queryByRole('checkbox')).toBeNull();
  } finally { view.unmount(); }
});
