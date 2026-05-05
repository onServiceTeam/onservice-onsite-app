// BUG-PHASE151-01 — provider job-completion notes were silently
// dropped end-to-end:
//
//   Mobile complete.tsx: PATCH /bookings/:id/status with
//     `notes: notes.trim() || undefined`
//   ↓
//   Validator: updateBookingStatusSchema didn't declare `notes`
//     → Zod stripped it (default-strip behavior, same MED-N85 class)
//   ↓
//   Service: transitionBookingStatus(... cancellationReason)
//     → no notes parameter
//   ↓
//   bookings.completion_notes column: didn't exist
//   ↓
//   Provider notes: theatrical, never persisted
//
// Fix landed in 4 layers:
//   1. Migration 126 — adds bookings.completion_notes TEXT column
//   2. Validator — declares completionNotes (string max 2000 optional)
//   3. Service — accepts + persists completionNotes when newStatus
//      = 'completed_by_provider'
//   4. Mobile — renames `notes` → `completionNotes` in PATCH body
//
// Same MED-N85-class root cause and same multi-layer fix shape as
// Phase 127 (device-fingerprint binding).
//
// Test strategy: source-content regression on validator + service +
// route + mobile + migration. End-to-end behavioral test would need
// a full DB harness; the four-file plumb-through is best verified
// by source-level assertions on the contract.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VALIDATOR = readFileSync(
  resolve(__dirname, '../src/validators/booking.validators.ts'),
  'utf8',
);
const SERVICE = readFileSync(
  resolve(__dirname, '../src/services/booking.service.ts'),
  'utf8',
);
const ROUTE = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);
const MIGRATION = readFileSync(
  resolve(__dirname, '../migrations/126_phase151_bookings_completion_notes.sql'),
  'utf8',
);
const MOBILE = readFileSync(
  resolve(
    __dirname,
    '../../../apps/mobile/app/provider/job/[id]/complete.tsx',
  ),
  'utf8',
);

describe('BUG-PHASE151-01 — completion notes plumb through end-to-end', () => {
  describe('1. Migration', () => {
    it('migration adds bookings.completion_notes column', () => {
      expect(MIGRATION).toMatch(
        /ALTER TABLE bookings\s+ADD COLUMN IF NOT EXISTS completion_notes TEXT/,
      );
    });
  });

  describe('2. Validator', () => {
    it('updateBookingStatusSchema declares completionNotes', () => {
      expect(VALIDATOR).toMatch(
        /completionNotes: z\.string\(\)\.max\(2000\)\.optional\(\)/,
      );
    });

    it('regression guard: schema does NOT declare a `notes` field (would mask the rename)', () => {
      // Inside updateBookingStatusSchema only.
      const block = VALIDATOR.match(
        /export const updateBookingStatusSchema = z\.object\(\{[\s\S]+?\}\);/,
      );
      expect(block).not.toBeNull();
      if (block) {
        // No bare `notes:` field declared on the status-update schema.
        expect(block[0]).not.toMatch(/^\s+notes:\s/m);
      }
    });
  });

  describe('3. Service', () => {
    it('transitionBookingStatus accepts a completionNotes parameter', () => {
      expect(SERVICE).toMatch(/completionNotes\?:\s*string,/);
    });

    it('service writes completion_notes column on completed_by_provider transition', () => {
      // Match the body where newStatus === 'completed_by_provider'
      // and completionNotes is appended to updates.
      expect(SERVICE).toMatch(
        /completion_notes = \$\$\{paramIdx\}/,
      );
    });
  });

  describe('4. Route', () => {
    it('route handler forwards req.body.completionNotes to the service', () => {
      expect(ROUTE).toMatch(/req\.body\.completionNotes/);
    });
  });

  describe('5. Mobile', () => {
    it('mobile PATCH body uses completionNotes (not notes)', () => {
      // Match the PATCH /status block.
      expect(MOBILE).toMatch(
        /api\.patch\(`\/api\/v1\/bookings\/\$\{id\}\/status`,[\s\S]+?completionNotes:\s*notes\.trim\(\)/,
      );
    });

    it('regression guard: mobile no longer sends a bare `notes:` key in the PATCH body', () => {
      // The PATCH body block must not contain a `notes:` key
      // (only `completionNotes:`).
      const patchBody = MOBILE.match(
        /api\.patch\(`\/api\/v1\/bookings\/\$\{id\}\/status`,\s*\{[\s\S]+?\}\)/,
      );
      expect(patchBody).not.toBeNull();
      if (patchBody) {
        expect(patchBody[0]).not.toMatch(/\bnotes:\s/);
      }
    });
  });
});
