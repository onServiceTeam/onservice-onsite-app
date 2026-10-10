import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { captureApplicationLease, isApplicationLeaseCurrent, loadApplicationSession, resetApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { apiDraft, applicantId, draftFixture, revisionOne } from '../test-support/application-draft-fixture';

it('Bug UX-1319 — discard requires confirmation and exact saved revision and clears private controls only after confirmed deletion', async () => {
  resetApplicationSession();
  jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture()));
  await loadApplicationSession(applicantId);
  const lease = captureApplicationLease();
  render(<ProviderApplicationDraftActions fields={draftFixture().fields} />);
  fireEvent.click(screen.getByRole('button', { name: 'Draft details & recovery' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('does not delete uploaded files');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.delete).not.toHaveBeenCalled();
  jest.mocked(api.delete).mockRejectedValueOnce(new Error('Connection unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard unsubmitted draft' }));
  await waitFor(() => expect(useApplicationSession.getState().error).toBe('Connection unavailable'));
  expect(isApplicationLeaseCurrent(lease)).toBe(true);
  expect(useOnboardingStore.getState().governmentIdFrontUri).not.toBeNull();
  jest.mocked(api.delete).mockResolvedValueOnce({ status: 204, ok: true, data: null });
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard unsubmitted draft' }));
  await waitFor(() => expect(useApplicationSession.getState().draft).toBeNull());
  expect(api.delete).toHaveBeenLastCalledWith('/api/v1/providers/application-draft', { body: { expectedRevision: revisionOne } });
  expect(useOnboardingStore.getState()).toMatchObject({ businessName: '', governmentIdFrontUri: null,
    selfieUri: null, icAgreed: false, categoryIds: [] });
  expect(isApplicationLeaseCurrent(lease)).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
});
