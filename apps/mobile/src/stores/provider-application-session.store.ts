import { create } from 'zustand';
import { useOnboardingStore } from './onboarding.store';
import {
  applicationStoreFields, deleteApplicationDraft, getApplicationDraft, putApplicationDraft,
  type ApplicationDraft, type ApplicationDraftFields,
} from '@/services/provider-application-draft.service';
import { getErrorCode, getErrorMessage } from '@/utils/errors';
import { submitSavedApplication } from '@/services/provider-application-submit.service';

export interface ApplicationLease { ownerId: string; generation: number }
interface ApplicationSession {
  ownerId: string | null;
  generation: number;
  activeRoute: string | null;
  routeEpoch: number;
  phase: 'idle' | 'loading' | 'ready' | 'submitted' | 'error';
  busy: boolean;
  conflict: boolean;
  error: string | null;
  draft: ApplicationDraft | null;
  savedInput: ApplicationDraftFields | null;
}

// Private applicant information stays in memory only. The typed owner-only API
// is its durable store, never public storage, generic logs or query caches.
export const useApplicationSession = create<ApplicationSession>(() => ({
  ownerId: null, generation: 0, activeRoute: null, routeEpoch: 0, phase: 'idle', busy: false,
  conflict: false, error: null, draft: null, savedInput: null,
}));

export function resetApplicationSession(): void {
  useApplicationSession.setState(state => ({
    ownerId: null, generation: state.generation + 1, phase: 'idle', busy: false,
    conflict: false, error: null, draft: null, savedInput: null,
  }));
  useOnboardingStore.getState().reset();
}

export function isApplicationLeaseCurrent(lease: ApplicationLease): boolean {
  const state = useApplicationSession.getState();
  return state.ownerId === lease.ownerId && state.generation === lease.generation;
}

export function captureApplicationLease(): ApplicationLease {
  const state = useApplicationSession.getState();
  if (!state.ownerId || state.phase !== 'ready') throw new Error('Wait for your application to load before continuing.');
  return { ownerId: state.ownerId, generation: state.generation };
}

function assertLease(lease: ApplicationLease): void {
  if (!isApplicationLeaseCurrent(lease)) throw new Error('Your application session changed. Reopen this screen before continuing.');
}

function recordFailure(lease: ApplicationLease, error: unknown, loading = false): void {
  if (!isApplicationLeaseCurrent(lease)) return;
  const code = getErrorCode(error);
  if (code === 'provider_application_already_submitted') {
    useOnboardingStore.getState().reset();
    useApplicationSession.setState(state => ({ phase: 'submitted', busy: false, draft: null,
      savedInput: null, error: null, generation: state.generation + 1 }));
    return;
  }
  const conflict = code === 'provider_application_draft_conflict';
  useApplicationSession.setState({
    phase: loading ? 'error' : 'ready', busy: false, conflict,
    error: conflict
      ? 'This draft changed in another session or expired. Your edits are still here. Reload the saved version before saving again.'
      : getErrorMessage(error, 'Your draft could not be saved. Your edits are still here. Please retry.'),
  });
}

/** Initial load or an explicitly confirmed reload. Gate children must unmount. */
export async function loadApplicationSession(ownerId: string): Promise<void> {
  const previous = useApplicationSession.getState();
  // Coalesce StrictMode's repeated initial effect, without an unscoped promise.
  if (previous.ownerId === ownerId && previous.phase === 'loading') return;
  const wantsProvider = useOnboardingStore.getState().selectedRole === 'provider';
  const lease = { ownerId, generation: previous.generation + 1 };
  if (previous.ownerId !== ownerId) useOnboardingStore.getState().reset();
  useApplicationSession.setState({ ...lease, phase: 'loading', busy: false, conflict: false, error: null, draft: null, savedInput: null });
  try {
    const draft = await getApplicationDraft(ownerId);
    assertLease(lease);
    useOnboardingStore.getState().reset();
    if (draft) useOnboardingStore.setState(applicationStoreFields(draft.fields));
    else if (wantsProvider) useOnboardingStore.getState().setRole('provider');
    useApplicationSession.setState({ phase: 'ready', draft, savedInput: draft?.fields ?? null });
  } catch (error) { recordFailure(lease, error, true); }
}

/** Preserve fields on failure and serialize all local draft writes. */
export async function saveApplicationSession(
  lease: ApplicationLease, fields: ApplicationDraftFields,
): Promise<ApplicationDraft> {
  assertLease(lease);
  const session = useApplicationSession.getState();
  if (session.phase !== 'ready' || session.busy || session.conflict) throw new Error('Wait for the current operation or reload the saved draft before saving again.');
  // Capture a copy before any await. A caller changing its object cannot change
  // what this request claims to have saved. Validation remains in the service.
  const snapshot = { ...fields, categoryIds: [...fields.categoryIds], vettingAnswers: {
    ...fields.vettingAnswers, references: fields.vettingAnswers.references.map(reference => ({ ...reference })),
  } };
  useOnboardingStore.setState(applicationStoreFields(snapshot));
  useApplicationSession.setState({ busy: true, error: null });
  try {
    const draft = await putApplicationDraft(lease.ownerId, session.draft?.revision ?? null, snapshot);
    assertLease(lease);
    // No overwrite of controls after await: the applicant may have typed more.
    useApplicationSession.setState({ busy: false, draft, savedInput: snapshot });
    return draft;
  } catch (error) {
    recordFailure(lease, error);
    throw error;
  }
}

/** A fresh explicit submit saves and consumes exactly one version, never a stale snapshot. */
export async function saveAndSubmitApplicationSession(
  lease: ApplicationLease, fields: ApplicationDraftFields, maySubmit: () => boolean,
): Promise<boolean> {
  const saved = await saveApplicationSession(lease, fields);
  // Navigating away or changing account during PUT must not start a submission.
  if (!maySubmit()) return false;
  assertLease(lease);
  const current = useApplicationSession.getState();
  if (current.busy || current.conflict || current.draft?.revision !== saved.revision) {
    throw new Error('Your draft changed before submission. Review it and try again.');
  }
  useApplicationSession.setState({ busy: true });
  try {
    await submitSavedApplication(fields, saved.revision);
    assertLease(lease);
    useApplicationSession.setState({ busy: false });
    return true;
  } catch (error) {
    recordFailure(lease, error);
    throw error;
  }
}

export function markApplicationSubmitted(lease: ApplicationLease): void {
  assertLease(lease);
  useOnboardingStore.getState().reset();
  useApplicationSession.setState(state => ({ phase: 'submitted', generation: state.generation + 1,
    busy: false, conflict: false, error: null, draft: null, savedInput: null }));
}

/** Call only after an explicit discard confirmation. Does not delete files. */
export async function discardApplicationSession(lease: ApplicationLease): Promise<void> {
  assertLease(lease);
  const state = useApplicationSession.getState();
  if (state.phase !== 'ready' || state.busy || state.conflict) throw new Error('Reload the saved draft before discarding it.');
  useApplicationSession.setState({ busy: true, error: null });
  try {
    if (state.draft) await deleteApplicationDraft(state.draft.revision);
    assertLease(lease);
    useOnboardingStore.getState().reset();
    // Remount controls and invalidate delayed file pickers/location callbacks.
    useApplicationSession.setState({ generation: state.generation + 1, busy: false, draft: null, savedInput: null });
  } catch (error) {
    recordFailure(lease, error);
    throw error;
  }
}
