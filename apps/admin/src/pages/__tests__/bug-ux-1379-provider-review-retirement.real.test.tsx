import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { ProviderApprovalReview } from '@/components/ProviderApprovalReview';
import { VETTING_ITEMS } from '@/components/VettingChecklist';
import { base, index, json, providerId, revision, revisionId, signIn } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Bug UX-1379 — reloads and operator-session changes retire the submission ID and all prior approval attestations', async () => {
  signIn();
  let fail = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (fail) return json(null, 503);
    if (url === `${base}?limit=20`) return json({ ...index, currentStatus: 'pending' });
    if (url === `${base}/${revisionId}`) return json({ providerId, currentStatus: 'pending', revision, decisionContractVersion: 1, decision: null });
    return json(null, 404);
  }));
  const onChange = vi.fn();
  const view = render(<ProviderApprovalReview providerId={providerId} onChange={onChange} />);
  try {
    const fill = async () => {
      await screen.findByRole('textbox', { name: 'Approval rationale' });
      for (const item of VETTING_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Approval rationale' }), { target: { value: 'Original documents and application reviewed.' } });
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ isComplete: true, expectedRevisionId: revisionId })));
    };
    await fill();
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest submission and clear review' }));
    await screen.findByRole('alert');
    expect(onChange).toHaveBeenLastCalledWith({ isComplete: false, rationale: '' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
    expect(await screen.findByRole('textbox', { name: 'Approval rationale' })).toHaveValue('');
    expect(onChange.mock.lastCall?.[0].isComplete).toBe(false);
    await fill();
    act(() => signIn()); // Fresh login by the same operator is a different session.
    expect(await screen.findByRole('alert')).toHaveTextContent('Review session changed');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(revision.businessName)).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ isComplete: false, rationale: '' });
  } finally { view.unmount(); }
});
