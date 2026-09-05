// Synthetic applicant data only. Kept outside Jest's __tests__ discovery tree.
import { draftFieldsSchema, type ApplicationDraft } from '@/services/provider-application-draft.service';

export const applicantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const revisionOne = '11111111-1111-4111-8111-111111111111';
export const revisionTwo = '22222222-2222-4222-8222-222222222222';
export const applicant = { id: applicantId, role: 'customer' as const,
  phone: '+639170000001', firstName: 'Synthetic', lastName: 'Applicant', email: null, avatarUrl: null };
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
