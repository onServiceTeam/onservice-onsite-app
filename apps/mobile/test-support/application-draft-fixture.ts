/* global jest */
// Synthetic applicant data only. Kept outside Jest's __tests__ discovery tree.
import { applicationStoreFields, draftFieldsSchema, type ApplicationDraft, type ApplicationDraftFields } from '@/services/provider-application-draft.service';
import api from '@/services/api';
import { resetApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { useOnboardingStore } from '@/stores/onboarding.store';

export const applicantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const revisionOne = '11111111-1111-4111-8111-111111111111';
export const revisionTwo = '22222222-2222-4222-8222-222222222222';
export const applicant = { id: applicantId, role: 'customer' as const,
  phone: '+639170000001', firstName: 'Synthetic', lastName: 'Applicant', email: null, avatarUrl: null };
export function completeApplicationFields(): ApplicationDraftFields {
  return draftFieldsSchema.parse({ businessName: 'Synthetic home services', categoryIds: [revisionOne], serviceAreaId: revisionTwo,
    city: 'Cebu City', province: 'Cebu', latitude: 10.3157, longitude: 123.8854, yearsExperience: 5,
    governmentIdFrontUrl: `onboarding/${applicantId}/front.jpg`, governmentIdBackUrl: `onboarding/${applicantId}/back.jpg`,
    nbiClearanceUrl: `onboarding/${applicantId}/nbi.jpg`, selfieUrl: `onboarding/${applicantId}/selfie.jpg`,
    vettingAnswers: { mainSkills: 'Cleaning', references: [{ name: 'Synthetic reference', contact: '09170000000', relation: 'Past client' }] },
  });
}
/** Screen-unit harness. Separate gate integration tests exercise real GET hydration. */
export function readyApplication(fields = draftFieldsSchema.parse({})): void {
  resetApplicationSession();
  useOnboardingStore.setState(applicationStoreFields(fields));
  useApplicationSession.setState({ ownerId: applicantId, phase: 'ready' });
}
export function mockDraftSaves(): void {
  jest.mocked(api.put).mockImplementation(async (_path, body) => {
    const request = body as { expectedRevision: string | null; fields: ApplicationDraftFields };
    return apiDraft(draftFixture({ fields: request.fields, revision: request.expectedRevision === revisionOne ? revisionTwo : revisionOne })) as never;
  });
}
export function draftFixture(patch: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    revision: revisionOne,
    fields: draftFieldsSchema.parse({ businessName: 'Saved applicant business',
      governmentIdFrontUrl: `onboarding/${applicantId}/front.jpg`,
      vettingAnswers: { mainSkills: 'Painting', references: [{ name: 'Unfinished reference' }] },
    }),
    createdAt: '2026-09-01T01:00:00.000Z', savedAt: '2026-09-05T01:00:00.000Z',
    expiresAt: '2026-10-05T01:00:00.000Z', ...patch,
  };
}
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function apiDraft(draft: ApplicationDraft | null): { data: { success: boolean; data: ApplicationDraft | null }; status: number; ok: boolean } {
  return { data: { success: true, data: draft }, status: 200, ok: true };
}
