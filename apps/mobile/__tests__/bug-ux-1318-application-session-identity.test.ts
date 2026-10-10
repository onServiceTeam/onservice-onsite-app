jest.unmock('@/stores/auth.store');
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(), getRefreshToken: jest.fn(), getStoredUser: jest.fn(),
  storeTokens: jest.fn(), storeUser: jest.fn(), clearTokens: jest.fn(), clearStoredUser: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn() }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
  ApiError: class extends Error {},
  storage: { set: jest.fn(), delete: jest.fn() },
  setAuthSessionExpiredHandler: jest.fn(),
}));
import api, { setAuthSessionExpiredHandler } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { captureApplicationLease, isApplicationLeaseCurrent, loadApplicationSession, saveApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { apiDraft, applicant, deferred, draftFixture, revisionTwo } from '../test-support/application-draft-fixture';

it('Bug UX-1318 — account and role transitions clear private draft memory and invalidate delayed load save and screen work', async () => {
  useAuthStore.setState({ user: applicant, isAuthenticated: true });
  const lateLoad = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.get).mockReturnValueOnce(lateLoad.promise);
  const loading = loadApplicationSession(applicant.id);
  const other = { ...applicant, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  useAuthStore.getState().setUser(other);
  lateLoad.resolve(apiDraft(draftFixture()));
  await loading;
  expect(useOnboardingStore.getState().businessName).toBe('');
  expect(useApplicationSession.getState()).toMatchObject({ phase: 'idle', ownerId: null });
  useAuthStore.getState().setUser(applicant);
  jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture()));
  await loadApplicationSession(applicant.id);
  const lease = captureApplicationLease();
  useAuthStore.getState().setUser({ ...applicant, firstName: 'Profile update' });
  expect(isApplicationLeaseCurrent(lease)).toBe(true);
  const lateSave = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.put).mockReturnValueOnce(lateSave.promise);
  const saving = saveApplicationSession(lease, draftFixture().fields);
  // A newer login for the same owner must also invalidate in-flight work.
  jest.mocked(api.post).mockResolvedValueOnce({ data: { success: true, data: {
    accessToken: 'new-access', refreshToken: 'new-refresh', user: applicant,
  } }, status: 200, ok: true });
  await useAuthStore.getState().verifyOtp(applicant.phone, '123456');
  lateSave.resolve(apiDraft(draftFixture({ revision: revisionTwo })));
  await expect(saving).rejects.toThrow('session changed');
  expect(isApplicationLeaseCurrent(lease)).toBe(false);
  expect(useOnboardingStore.getState().governmentIdFrontUri).toBeNull();
  await expect(saveApplicationSession(lease, draftFixture().fields)).rejects.toThrow('session changed');
  expect(api.put).toHaveBeenCalledTimes(1);
  const expiredHandler = jest.mocked(setAuthSessionExpiredHandler).mock.calls[0]?.[0];
  expect(typeof expiredHandler).toBe('function');
  if (!expiredHandler) throw new Error('The real auth store did not register its expiry handler');
  for (const transition of [
    () => useAuthStore.getState().applyStaffSession('staff-access', 'staff-refresh'),
    () => expiredHandler(),
    () => useAuthStore.getState().logout(),
  ]) {
    useAuthStore.setState({ user: applicant, isAuthenticated: true });
    jest.mocked(api.get).mockResolvedValueOnce(apiDraft(draftFixture()));
    await loadApplicationSession(applicant.id);
    expect(useOnboardingStore.getState().businessName).not.toBe('');
    await transition();
    expect(useOnboardingStore.getState().businessName).toBe('');
    expect(useApplicationSession.getState().draft).toBeNull();
  }
});
