// Phase E CRIT-102 — provider/job/[id]/complete.tsx photo upload + status transition.
//
// Pre-fix: api.post('/api/v1/bookings/{id}/complete', { photos: [...file:// URIs], signedAt, notes })
// Three problems:
//   1. The endpoint /:id/complete doesn't exist. Real route is
//      PATCH /:id/status (booking.routes.ts:425).
//   2. file:// URIs sent as JSON strings — backend MED-N97 hardening
//      rejects file:// for any persistence URL field.
//   3. Photos never landed in booking_photos table.
//
// Post-fix asserted below: each photo uploaded individually via
// uploadBookingPhoto with photoType='after', then PATCH /:id/status
// with status='completed_by_provider'.
//
// CRIT-103/104 (signature visual persistence) is escalated separately
// — see .ai-coder/escalations/E01-signature-image-persistence-2026-05-02.md.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPLETE = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/complete.tsx'),
  'utf8',
);

describe('Phase E CRIT-102 — complete.tsx persists real photos and uses canonical status PATCH', () => {
  it('CRIT-102 — non-existent /bookings/:id/complete POST removed', () => {
    expect(COMPLETE).not.toMatch(/api\.post\(`?\/api\/v1\/bookings\/\$\{id\}\/complete`?/);
  });
  it('CRIT-102 — uploadBookingPhoto helper imported from booking-photo.service', () => {
    expect(COMPLETE).toMatch(
      /import \{ uploadBookingPhoto \} from ['"]@\/services\/booking-photo\.service['"]/,
    );
  });
  it('CRIT-102 — each captured photo uploaded with photoType=after', () => {
    expect(COMPLETE).toMatch(
      /uploadBookingPhoto\(\{ uri: photoUri, bookingId: id, photoType: ['"]after['"] \}\)/,
    );
  });
  it('CRIT-102 — booking transitioned via PATCH /:id/status with completed_by_provider', () => {
    expect(COMPLETE).toMatch(
      /api\.patch\(`?\/api\/v1\/bookings\/\$\{id\}\/status`?[^)]*completed_by_provider/s,
    );
  });
  it('CRIT-102 — header comment references the CRIT-103/104 signature escalation', () => {
    expect(COMPLETE).toMatch(/E01-signature-image-persistence/);
  });
});

describe('Phase E CRIT-103/104 — signature persistence escalation file exists', () => {
  it('CRIT-103/104 — escalation file present', () => {
    const ESCALATION = readFileSync(
      resolve(__dirname, '../../../.ai-coder/escalations/E01-signature-image-persistence-2026-05-02.md'),
      'utf8',
    );
    expect(ESCALATION).toMatch(/PENDING KEN DECISION/);
    expect(ESCALATION).toMatch(/Option A/);
    expect(ESCALATION).toMatch(/Option B/);
    expect(ESCALATION).toMatch(/Option C/);
  });
});
