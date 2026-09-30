import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { mountSubmission, index, revision, json, base, providerId, revisionId } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Submitted evidence distinguishes legacy absence, outages, response mismatches and uncaptured optional values', async () => {
  const fixture = mountSubmission();
  try {
    fixture.fetcher.mockResolvedValueOnce(json(null, 503));
    fireEvent.click(screen.getByRole('button', { name: 'Review submitted applications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded or verified');
    expect(screen.queryByText(/No preserved submission record is available/)).toBeNull();
    expect(screen.queryByText('Synthetic private server detail')).toBeNull();
    fixture.fetcher.mockResolvedValueOnce(json({ ...index, historyState: 'not_recorded', revisions: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
    expect(await screen.findByText(/No preserved submission record is available/)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'View submission 1' })).toBeNull();
    fixture.fetcher.mockResolvedValueOnce(json({ ...index, providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh latest submissions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No current-profile substitute is shown');
    fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
    await screen.findByRole('button', { name: 'View submission 1' });
    for (const invalid of [
      { providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', revision },
      { providerId, revision: { ...revision, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } },
      { providerId, revision: { ...revision, revisionNumber: 2 } },
      { providerId, revision: { ...revision, schemaVersion: 2 } },
      { providerId, revision: { ...revision, documents: { ...revision.documents, selfie: 'https://example.invalid/private' } } },
    ]) {
      fixture.fetcher.mockResolvedValueOnce(json({ currentStatus: 'approved', ...invalid }));
      if (screen.queryByRole('button', { name: 'Retry submitted evidence' })) {
        fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
      } else { fireEvent.click(screen.getByRole('button', { name: 'View submission 1' })); }
      expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded or verified');
      expect(screen.queryByRole('region', { name: 'Submission 1 as submitted' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Load submitted Selfie' })).toBeNull();
    }
    fixture.fetcher.mockResolvedValueOnce(json({ providerId, currentStatus: 'approved', revision: {
      ...revision, nbiExpiryDate: null, governmentIdNumber: null, yearsExperience: null, vettingAnswers: null,
    } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry submitted evidence' }));
    const view = within(await screen.findByRole('region', { name: 'Submission 1 as submitted' }));
    expect(view.getAllByText('Not provided at submission')).toHaveLength(3);
    expect(view.getByText('No questionnaire was provided at submission.')).toBeVisible();
    expect(view.queryByText('99')).toBeNull();
    expect(screen.getByText('Current replacement skills')).toBeVisible();
  } finally { fixture.unmount(); }
});

it('Submitted evidence pages by exclusive revision cursor and discards a delayed selection without substituting another revision', async () => {
  const fixture = mountSubmission();
  const thirdId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const secondId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let finish!: (value: Response) => void;
  const delayed = new Promise<Response>(resolve => { finish = resolve; });
  fixture.fetcher.mockImplementation(async (url) => {
    if (url === `${base}?limit=20`) return json({ ...index, revisions: [
      { ...index.revisions[0], id: thirdId, revisionNumber: 3 },
      { ...index.revisions[0], id: secondId, revisionNumber: 2 },
    ], nextBeforeRevision: 2 });
    if (url === `${base}/${thirdId}`) return delayed;
    if (url === `${base}?limit=20&beforeRevision=2`) return json(index);
    if (url === `${base}/${revisionId}`) return json({ providerId, currentStatus: 'pending', revision });
    return json(null, 404);
  });
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Review submitted applications' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View submission 3' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading submission 3');
    fireEvent.click(screen.getByRole('button', { name: 'Older submissions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View submission 1' }));
    expect(await screen.findByRole('region', { name: 'Submission 1 as submitted' })).toBeVisible();
    await act(async () => { finish(json({ providerId, currentStatus: 'pending', revision: {
      ...revision, id: thirdId, revisionNumber: 3, previousRevisionNumber: 2, businessName: 'Late submission must stay hidden',
      documents: Object.fromEntries(Object.entries(revision.documents).map(([type]) => [type, `${base}/${thirdId}/kyc/${type}`])),
    } })); await delayed; });
    expect(screen.queryByText('Late submission must stay hidden')).toBeNull();
    expect(fixture.fetcher.mock.calls.find(call => call[0] === `${base}/${thirdId}`)?.[1]?.signal?.aborted).toBe(true);
    expect(screen.queryByRole('button', { name: 'Older submissions' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Newer submissions' }));
    expect(await screen.findByRole('button', { name: 'View submission 3' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Submission 1 as submitted' })).toBeNull();
    fixture.fetcher.mockResolvedValueOnce(json({ ...index, revisions: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Older submissions' }));
    expect(await screen.findByText('No older submissions on this page.')).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/No preserved submission record is available/)).toBeNull();
    expect(fixture.fetcher.mock.calls.every(call => call[1]?.method === 'GET')).toBe(true);
  } finally { fixture.unmount(); }
});
