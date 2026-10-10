import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '@/services/api';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';
import { apiDraft, applicant, deferred, draftFixture, readyApplication } from '../test-support/application-draft-fixture';
let mockRoute = 'categories';
const mockApplicant = applicant;
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mockApplicant }) }));
jest.mock('expo-router', () => ({ useSegments: () => ['provider-onboarding', mockRoute], Redirect: () => null }));

it('Bug UX-1324 — leaving the applicant screen during a save does not navigate forward when its reply arrives', async () => {
  readyApplication(draftFixture().fields);
  const pending = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.put).mockReturnValueOnce(pending.promise);
  const next = jest.fn();
  const view = render(<ProviderApplicationDraftActions fields={draftFixture().fields} onContinue={next} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  view.unmount();
  await act(async () => pending.resolve(apiDraft(draftFixture())));
  expect(next).not.toHaveBeenCalled();
  // A native stack may keep the old screen mounted after navigation.
  const retained = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.put).mockReturnValueOnce(retained.promise);
  readyApplication(draftFixture().fields);
  const retainedView = render(<ProviderApplicationSessionGate><ProviderApplicationDraftActions fields={draftFixture().fields} onContinue={next} /></ProviderApplicationSessionGate>);
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  mockRoute = 'service-area';
  retainedView.rerender(<ProviderApplicationSessionGate><ProviderApplicationDraftActions fields={draftFixture().fields} onContinue={next} /></ProviderApplicationSessionGate>);
  await act(async () => retained.resolve(apiDraft(draftFixture())));
  expect(next).not.toHaveBeenCalled();
});
