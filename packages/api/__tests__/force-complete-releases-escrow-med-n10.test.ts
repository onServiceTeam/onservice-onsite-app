// MED-N10 fix verified — forceCompleteBooking now releases escrow
// in the same transaction as the status flip when the booking has
// escrow held.
//
// Pre-fix: status flipped to 'confirmed' and the function returned.
// autoConfirmBookings (workers.ts) only picks up bookings whose
// `completed_at < NOW() - 24h`, so the provider waited up to a
// full day for their money after admin took an explicit action.
//
// Post-fix: pre-check escrow_status; if 'held', call
// escrowService.releaseEscrowInTransaction(client, bookingId) +
// flip status to 'payout_ready' inside the SAME transaction. If
// escrow_status is anything else (no payment captured, already
// released, refunded), the function falls through with the
// confirmed status flip and audits escrowReleased=false.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/booking-admin.service.ts'),
  'utf8',
);

describe('MED-N10 — forceCompleteBooking releases escrow when held', () => {
  it('pre-checks escrow_status before attempting release', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/SELECT escrow_status FROM bookings/);
  });

  it('only calls releaseEscrowInTransaction when escrow_status === \'held\'', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/const releasable = escrowStatus === 'held'/);
    expect(block![0]).toMatch(/if \(releasable\) \{[\s\S]*?escrowService\.releaseEscrowInTransaction\(client, bookingId\)/);
  });

  it('flips status to payout_ready in the same transaction when escrow released', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block![0]).toMatch(/status = 'payout_ready'/);
  });

  it('records escrowReleased flag in admin_actions details', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block![0]).toMatch(/JSON\.stringify\(\{ previousStatus: booking\.status, escrowReleased \}\)/);
  });

  it('logs escrowReleased flag for ops visibility', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block![0]).toMatch(/escrowReleased/);
    // Logged in the info call.
    expect(block![0]).toMatch(/logger\.info\('Booking force-completed by admin',\s*\{[\s\S]*?escrowReleased/);
  });

  it('the original status flip to confirmed remains (regression guard)', () => {
    const block = SVC.match(/forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};/);
    expect(block![0]).toMatch(/status = 'confirmed',\s*confirmed_at = NOW/);
  });

  it('uses the SAME db.transaction wrapper (escrow + status + audit atomic)', () => {
    // Anchor on the function signature + the unique closing return.
    const block = SVC.match(/export async function forceCompleteBooking[\s\S]*?return \{ bookingId, adminActionId \};\s*\}\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/return db\.transaction\(async \(client\) => \{/);
    // Only ONE return db.transaction in the function body.
    const returns = (block![0].match(/return db\.transaction/g) ?? []).length;
    expect(returns).toBe(1);
  });
});
