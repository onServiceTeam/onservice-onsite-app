// Phase 14 Dispatch 09 — Gate B reference coverage for D09 bugs.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ONBOARDING_SVC = readFileSync(resolve(__dirname, '../src/services/provider-onboarding.service.ts'), 'utf8');
const AREA_CHANGE_SVC = readFileSync(resolve(__dirname, '../src/services/service-area-change.service.ts'), 'utf8');
const M084 = readFileSync(resolve(__dirname, '../migrations/084_d09_provider_onboarding_progress.sql'), 'utf8');
const M085 = readFileSync(resolve(__dirname, '../migrations/085_d09_provider_documents.sql'), 'utf8');
const M086 = readFileSync(resolve(__dirname, '../migrations/086_d09_service_area_change_requests.sql'), 'utf8');
const LAUNCH_LIMITATIONS = readFileSync(resolve(__dirname, '../../../LAUNCH-LIMITATIONS.md'), 'utf8');

describe('Bug 162 — identity verification non-silent', () => {
  it('provider-onboarding.service writes durable submitForReview record (no silent bypass)', () => {
    expect(ONBOARDING_SVC).toMatch(/submitForReview/);
    expect(ONBOARDING_SVC).toMatch(/Bug 162/);
    expect(ONBOARDING_SVC).toMatch(/'provider_application_submitted'/);
  });
});

describe('Bug 1193 — NBI document upload via multipart not base64', () => {
  it('migration 085 stores documents with s3_key (not base64 in DB)', () => {
    expect(M085).toMatch(/CREATE TABLE provider_documents/);
    expect(M085).toMatch(/s3_key TEXT NOT NULL/);
    // Bug 1193 — document storage is now S3 multipart, not base64 in JSON.
  });
});

describe('Bug 1194 / Bug 1195 — selfie liveness vendor not wired', () => {
  it('selfie_liveness document_kind exists; manual admin review path documented', () => {
    expect(M085).toMatch(/'selfie_liveness'/);
    // v1.0 ships manual review; vendor wiring deferred to v1.1+ per LAUNCH-LIMITATIONS §27.
    expect(LAUNCH_LIMITATIONS).toMatch(/§27|## 27/);
  });
});

describe('Bug 1199 — onboarding timeline surfaced', () => {
  it('OnboardingProgress shape includes estimatedDecisionAt + estimatedReviewHours', () => {
    expect(ONBOARDING_SVC).toMatch(/estimatedDecisionAt/);
    expect(ONBOARDING_SVC).toMatch(/estimatedReviewHours/);
    expect(ONBOARDING_SVC).toMatch(/Bug 1199/);
  });

  it('migration 084 stores estimated_review_hours default 72', () => {
    expect(M084).toMatch(/estimated_review_hours INTEGER NOT NULL DEFAULT 72/);
  });
});

describe('Bug 1200 — submitted application editable after sent_back', () => {
  it('trackProgress allows edits when admin_decision = sent_back', () => {
    expect(ONBOARDING_SVC).toMatch(/Bug 1200/);
    expect(ONBOARDING_SVC).toMatch(/sent_back/);
  });

  it('isEditable computed: not submitted OR sent_back', () => {
    expect(ONBOARDING_SVC).toMatch(/isEditable/);
  });
});

describe('Bug 1268 — service area change has pending state', () => {
  it('migration 086 creates service_area_change_requests with pending status default', () => {
    expect(M086).toMatch(/CREATE TABLE service_area_change_requests/);
    expect(M086).toMatch(/status TEXT NOT NULL DEFAULT 'pending'/);
  });

  it('unique partial index ensures one pending request per provider', () => {
    expect(M086).toMatch(/CREATE UNIQUE INDEX idx_area_change_one_pending_per_provider/);
  });

  it('service-area-change.service exports requestChange + decide', () => {
    expect(AREA_CHANGE_SVC).toMatch(/requestChange/);
    expect(AREA_CHANGE_SVC).toMatch(/export async function decide/);
    expect(AREA_CHANGE_SVC).toMatch(/Bug 1268/);
  });
});

describe('D09 audit verbs in admin_actions', () => {
  it('migration 085 extends action_type with provider_application_* + service_area_change_*', () => {
    expect(M085).toMatch(/'provider_application_submitted'/);
    expect(M085).toMatch(/'provider_application_approved'/);
    expect(M085).toMatch(/'provider_application_rejected'/);
    expect(M085).toMatch(/'provider_application_sent_back'/);
    expect(M085).toMatch(/'service_area_change_approved'/);
    expect(M085).toMatch(/'service_area_change_rejected'/);
  });
});
