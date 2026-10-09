import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api, { ApiError } from '@/services/api';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { loadApplicationSession, resetApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { apiDraft, applicantId, deferred, draftFixture, revisionOne, revisionTwo } from '../test-support/application-draft-fixture';

it('Bug UX-1317 — explicit draft actions preserve failed saves and require confirmed reload before resolving a revision conflict', async () => {
  resetApplicationSession();
  jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture()));
  await loadApplicationSession(applicantId);
  const next = jest.fn();
  function Form() {
    const [name, setName] = useState('Changed business');
    return <><input aria-label="Business draft" value={name} onChange={event => setName(event.target.value)} />
      <ProviderApplicationDraftActions fields={{ ...draftFixture().fields, businessName: name }} onContinue={next} /></>;
  }
  const view = render(<Form />);
  expect(api.put).not.toHaveBeenCalled();
  jest.mocked(api.put).mockRejectedValueOnce(new Error('Connection unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Connection unavailable'));
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Business draft')).toHaveProperty('value', 'Changed business');
  expect(useOnboardingStore.getState().businessName).toBe('Changed business');
  const conflict = new ApiError(409, { success: false, error: { code: 'provider_application_draft_conflict', message: 'Conflict' } }, 'Conflict');
  jest.mocked(api.put).mockRejectedValueOnce(conflict);
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('changed in another session or expired'));
  expect(screen.getByRole('button', { name: 'Save & continue' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved draft' }));
  expect(api.get).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.get).toHaveBeenCalledTimes(1);
  jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture({ revision: revisionTwo })));
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace with saved draft' }));
  await waitFor(() => expect(useApplicationSession.getState()).toMatchObject({ phase: 'ready', conflict: false, draft: { revision: revisionTwo } }));
  expect(useOnboardingStore.getState().businessName).toBe('Saved applicant business');
  // A real layout gate remounts local controls after this generation change.
  view.unmount();
  render(<Form />);
  const pending = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.put).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  fireEvent.change(screen.getByLabelText('Business draft'), { target: { value: 'Newer typing' } });
  await act(async () => pending.resolve(apiDraft(draftFixture({ revision: revisionOne, fields: { ...draftFixture().fields, businessName: 'Changed business' } }))));
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByText('Your earlier details were saved. Save your newest edits before continuing.')).toBeTruthy();
  expect(api.put).toHaveBeenLastCalledWith('/api/v1/providers/application-draft', { expectedRevision: revisionTwo,
    fields: { ...draftFixture().fields, businessName: 'Changed business' } });
});
