// Phase E CRIT-102/103/104 — provider/job/[id]/complete.tsx full
// completion flow now persists photos AND signature, then transitions
// the booking via the canonical status PATCH.
//
// Pre-fix:
//   - POST to /api/v1/bookings/{id}/complete (404, never existed)
//   - file:// URIs sent verbatim in JSON
//   - PanResponder collected (x,y) points but never produced a PNG
//   - booking_signatures rows never landed → no legal proof of acceptance
//
// Post-fix asserted below:
//   - photos uploaded individually via uploadBookingPhoto with photoType='after'
//   - signature canvas (react-native-signature-canvas) produces a real PNG;
//     uploadSignature posts it with signatureType='customer_acceptance'
//   - booking transitioned via PATCH /:id/status with status='completed_by_provider'

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
      /import \{ uploadBookingPhoto, uploadSignature \} from ['"]@\/services\/booking-photo\.service['"]/,
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
});

describe('Phase E CRIT-103/104 (E01 Option A) — signature persistence end-to-end', () => {
  it('CRIT-103 — SignaturePad component imported', () => {
    expect(COMPLETE).toMatch(
      /import SignaturePad, \{ type SignaturePadRef \} from ['"]@\/components\/SignaturePad['"]/,
    );
  });
  it('CRIT-103 — signature ref + capture promise plumbing present', () => {
    expect(COMPLETE).toMatch(/signaturePadRef = useRef<SignaturePadRef \| null>/);
    expect(COMPLETE).toMatch(/captureResolverRef = useRef/);
  });
  it('CRIT-103 — readSignatureFile awaits the WebView round-trip with timeout', () => {
    expect(COMPLETE).toMatch(/readSignatureFile = \(\): Promise<string>/);
    expect(COMPLETE).toMatch(/Signature capture timed out/);
  });
  it('CRIT-104 — uploadSignature called on submit with customer_acceptance type', () => {
    expect(COMPLETE).toMatch(
      /uploadSignature\(\{[^}]*signatureType: ['"]customer_acceptance['"]/s,
    );
  });
  it('CRIT-104 — bookingId forwarded to uploadSignature', () => {
    expect(COMPLETE).toMatch(/uploadSignature\(\{[^}]*bookingId: id/s);
  });
  it('CRIT-103 — old PanResponder dot-canvas removed from JSX render path', () => {
    // Outside of the deprecation comment block.
    expect(COMPLETE).not.toMatch(/panResponder\.panHandlers/);
    expect(COMPLETE).not.toMatch(/signaturePoints\.map\(\(pt, i\)/);
  });
  it('CRIT-103 — signedAt captured at first stroke via onBegin', () => {
    expect(COMPLETE).toMatch(/handleSignatureBegin = \(\): void/);
    expect(COMPLETE).toMatch(/setSignedAt\(new Date\(\)\.toISOString\(\)\)/);
  });
});
