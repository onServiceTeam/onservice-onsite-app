import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { resetApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { apiDraft, applicant, deferred, draftFixture } from '../test-support/application-draft-fixture';

let mockRoute = 'categories';
const mockApplicant = applicant;
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mockApplicant }) }));
jest.mock('expo-router', () => ({
  useSegments: () => ['provider-onboarding', mockRoute],
  Redirect: ({ href }: { href: string }) => <span>Redirect: {href}</span>,
}));

it('Bug UX-1316 — applicant controls mount only after a valid owner draft loads and never restore agreement acceptance', async () => {
  resetApplicationSession();
  const pending = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.get).mockReturnValueOnce(pending.promise);
  const mounts = jest.fn();
  function Controls() {
    const [name] = useState(() => { mounts(); return useOnboardingStore.getState().businessName; });
    return <input aria-label="Applicant business" value={name} readOnly />;
  }
  const view = render(<ProviderApplicationSessionGate><Controls /></ProviderApplicationSessionGate>);
  expect(screen.queryByLabelText('Applicant business')).toBeNull();
  expect(mounts).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ data: { success: true, data: { ...draftFixture(), icAgreed: true } }, status: 200, ok: true } as never));
  expect(screen.getByRole('alert').textContent).toContain('could not be read');
  expect(mounts).not.toHaveBeenCalled();
  jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture()));
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading application' }));
  await waitFor(() => expect(screen.getByLabelText('Applicant business')).toHaveProperty('value', 'Saved applicant business'));
  expect(mounts).toHaveBeenCalledTimes(1);
  expect(useOnboardingStore.getState()).toMatchObject({ selectedRole: 'provider', icAgreed: false,
    governmentIdFrontUri: `onboarding/${applicant.id}/front.jpg` });
  expect(useOnboardingStore.getState().vetting.references[0]).toEqual({ name: 'Unfinished reference', contact: '', relation: '' });
  // Status pages must remain reachable even when draft storage is unavailable.
  mockRoute = 'review-pending';
  await act(async () => { resetApplicationSession(); });
  view.rerender(<ProviderApplicationSessionGate><span>Canonical application status</span></ProviderApplicationSessionGate>);
  expect(screen.getByText('Canonical application status')).toBeTruthy();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(useApplicationSession.getState().phase).toBe('idle');
});
