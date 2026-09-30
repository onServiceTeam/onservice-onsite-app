import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ProfileTab, type ProviderProfile } from '../../ProviderDetailPage';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

export const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const revisionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const base = `/api/v1/admin/providers/${providerId}/application-revisions`;
export const documents = Object.fromEntries(['government_id_front', 'government_id_back', 'nbi_clearance', 'selfie']
  .map(type => [type, `${base}/${revisionId}/kyc/${type}`]));
export const revision = {
  id: revisionId, revisionNumber: 1, previousRevisionNumber: null, schemaVersion: 1,
  businessName: 'Original Cebu Services', serviceRadiusKm: 25, latitude: 10.3157, longitude: 123.8854,
  city: 'Original city', province: 'Original province',
  serviceArea: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Original service market' },
  categories: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Original cleaning category' }],
  nbiExpiryDate: '2027-02-03', governmentIdNumber: 'SYNTHETIC-ID-001', yearsExperience: 0,
  vettingAnswers: {
    mainSkills: 'Detailed original skills\nSecond line', hasOwnTools: false, businessType: 'Individual',
    yearStarted: '2026', teamSize: '1', fullAddress: 'Full original address',
    website: 'javascript:alert(1)', facebook: 'https://example.invalid/profile', socialOther: 'Original social links',
    credentials: 'Original training', registrations: 'Original registration', resumeUrl: 'https://example.invalid/cv',
    references: [{ name: 'Synthetic reference', contact: 'reference@example.invalid', relation: 'Former client' }],
  },
  agreementAcceptedAt: '2026-09-06T02:01:00.000Z', submittedAt: '2026-09-06T02:02:00.000Z',
  recordedAt: '2026-09-06T02:02:01.000Z', documents,
};
export const index = {
  providerId, currentStatus: 'approved', historyState: 'recorded',
  revisions: [{ id: revisionId, revisionNumber: 1, submittedAt: revision.submittedAt }], nextBeforeRevision: null,
};
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status < 400 ? { success: true, data } : {
    success: false, error: { message: 'Synthetic private server detail' },
  }), { status, headers: { 'Content-Type': 'application/json' } });
}
export function signIn(id = 'synthetic-reviewer'): void {
  useAuthStore.getState().login({ id, role: 'admin', firstName: 'Synthetic', lastName: 'Operator',
    email: 'operator@example.invalid', phone: '', avatarUrl: null } satisfies AdminUser);
}
export function mountSubmission() {
  signIn();
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === `${base}?limit=20`) return json(index);
    if (url === `${base}/${revisionId}`) return json({ providerId, currentStatus: 'approved', revision });
    return json(null, 404);
  });
  vi.stubGlobal('fetch', fetcher);
  const profile = { id: providerId, businessName: 'Current renamed business', userId: 'synthetic-owner',
    yearsExperience: 99, vettingAnswers: { mainSkills: 'Current replacement skills' },
    declaredCategories: [{ id: revision.categories[0]!.id, name: 'Renamed current category', isActive: true }],
  } as ProviderProfile;
  const view = render(<ProfileTab profile={profile} />);
  return { unmount: view.unmount, rerender: view.rerender, fetcher, profile };
}
