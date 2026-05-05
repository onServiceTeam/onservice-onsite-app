// BUG-PHASE159-01 — Two admin decision services had a min(30) reason
// check but no max cap. Both columns are TEXT (admin_decision_reason
// in admin_latent.decide flow + service_area_change_requests
// decision_reason TEXT) — unbounded by Postgres.
//
// Same defense-in-depth pattern as Phase 152-158. Cap at 5000 chars
// (free-form decision rationale).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ONBOARDING_SVC = readFileSync(
  resolve(__dirname, '../src/services/provider-onboarding.service.ts'),
  'utf8',
);
const AREA_CHANGE_SVC = readFileSync(
  resolve(__dirname, '../src/services/service-area-change.service.ts'),
  'utf8',
);

describe('BUG-PHASE159-01 — admin decide reason max caps', () => {
  describe('provider-onboarding adminDecide', () => {
    it('rejects reason > 5000 chars', () => {
      expect(ONBOARDING_SVC).toMatch(
        /input\.reason\.trim\(\)\.length > 5000[\s\S]+?Decision reason must be ≤ 5000 characters/,
      );
    });

    it('PHASE159 fix-comment is preserved', () => {
      expect(ONBOARDING_SVC).toMatch(/BUG-PHASE159-01 fix/);
    });
  });

  describe('service-area-change decide', () => {
    it('rejects reason > 5000 chars', () => {
      expect(AREA_CHANGE_SVC).toMatch(
        /input\.reason\.trim\(\)\.length > 5000[\s\S]+?Decision reason must be ≤ 5000 characters/,
      );
    });

    it('PHASE159 fix-comment is preserved', () => {
      expect(AREA_CHANGE_SVC).toMatch(/BUG-PHASE159-01 fix/);
    });
  });
});
