import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { mountSubmission, revision, base, revisionId } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Bug UX-1376 — the provider profile exposes every captured submission field without substituting the current profile', async () => {
  const fixture = mountSubmission();
  try {
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review submitted applications' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View submission 1' }));
    const evidence = await screen.findByRole('region', { name: 'Submission 1 as submitted' });
    const view = within(evidence);
    for (const text of [revision.businessName, revision.city, revision.province, revision.serviceArea.name,
      revision.categories[0]!.name, revision.governmentIdNumber, revision.vettingAnswers.fullAddress,
      revision.vettingAnswers.businessType, revision.vettingAnswers.website, revision.vettingAnswers.facebook,
      revision.vettingAnswers.socialOther, revision.vettingAnswers.credentials, revision.vettingAnswers.registrations,
      revision.vettingAnswers.resumeUrl, 'Synthetic reference', 'reference@example.invalid', 'Former client']) {
      expect(view.getByText(text)).toBeVisible();
    }
    expect(view.getByText(/Detailed original skills/)).toHaveTextContent('Second line');
    expect(view.getByText('25 km')).toBeVisible();
    expect(view.getByText('10.3157, 123.8854')).toBeVisible();
    expect(view.getByText('2027-02-03')).toBeVisible();
    expect(view.getByText('0')).toBeVisible();
    expect(view.getByText('No')).toBeVisible();
    expect(view.getByText('2026')).toBeVisible();
    expect(view.getByText('1', { selector: 'dd' })).toBeVisible();
    for (const time of [revision.agreementAcceptedAt, revision.submittedAt, revision.recordedAt]) {
      expect(evidence.querySelector(`time[datetime="${time}"]`)).toBeVisible();
    }
    expect(view.getByText(revisionId)).toBeVisible();
    expect(view.getByText(/Original account name and agreement wording were not captured/)).toBeVisible();
    expect(view.getByText(/does not identify which submission was approved/)).toBeVisible();
    expect(view.queryByText('Current replacement skills')).toBeNull();
    expect(view.queryByText('Renamed current category')).toBeNull();
    expect(screen.getByText('Current replacement skills')).toBeVisible();
    expect(view.queryByRole('link')).toBeNull(); // Applicant text never becomes an unvalidated link.
    for (const label of ['Government ID (front)', 'Government ID (back)', 'NBI Clearance', 'Selfie']) {
      expect(view.getByRole('button', { name: `Load submitted ${label}` })).toBeEnabled();
    }
    expect(fixture.fetcher.mock.calls.map(call => call[0])).toEqual([`${base}?limit=20`, `${base}/${revisionId}`]);
    expect(fixture.fetcher).toHaveBeenLastCalledWith(`${base}/${revisionId}`,
      expect.objectContaining({ credentials: 'include', method: 'GET', signal: expect.any(globalThis.AbortSignal) }));
  } finally { fixture.unmount(); }
});
