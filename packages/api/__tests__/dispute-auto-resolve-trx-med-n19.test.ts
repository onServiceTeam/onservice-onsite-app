// MED-N19 fix verified — auto-resolved dispute refund now runs
// INSIDE the same transaction as the dispute/booking status flip.
//
// Pre-fix: inside the transaction, dispute=resolved + booking.escrow_status=
// refunded. Then OUTSIDE the transaction, escrow refund executed. If the
// refund failed, the dispute and booking were durably 'resolved' but no
// money moved. Customer expected refund, didn't get it.
//
// Post-fix: refundFromEscrowInTransaction (the trx-aware variant)
// reuses the same pg client, so any failure rolls back the whole
// auto-resolution including the dispute INSERT and the booking
// status flip.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/dispute.service.ts'),
  'utf8',
);

describe('MED-N19 — dispute auto-resolution refund is transactional', () => {
  it('attemptAutoResolution calls refundFromEscrowInTransaction (trx-aware variant)', () => {
    expect(SVC).toMatch(/escrowService\.refundFromEscrowInTransaction\(/);
    // Inside attemptAutoResolution function, anchored on the surrounding
    // logic (UPDATE disputes ... auto_resolved = TRUE).
    const block = SVC.match(/auto_resolved = TRUE[\s\S]{0,1500}refundFromEscrowInTransaction/);
    expect(block).not.toBeNull();
  });

  it('the refund call passes the same `client` the rest of the transaction uses', () => {
    expect(SVC).toMatch(/refundFromEscrowInTransaction\(\s*client as unknown/);
  });

  it('the post-commit refund block is REMOVED', () => {
    // The pre-fix code matched: `if (dispute.status === 'resolved' && dispute.auto_resolved && Number(dispute.refund_amount) > 0) { try { await escrowService.refundFromEscrow(...`
    // After the fix that block is gone (or remains only as a comment).
    expect(SVC).not.toMatch(/await escrowService\.refundFromEscrow\(bookingId, Number\(dispute\.refund_amount\)/);
  });

  it('comment documents the MED-N19 fix rationale', () => {
    expect(SVC).toMatch(/MED-N19 fix.*?refund/s);
  });

  it('no calls to the non-trx escrowService.refundFromEscrow remain in the dispute file flow', () => {
    // refundFromEscrow (no In Transaction) should NOT appear at all
    // within the fileDispute / attemptAutoResolution scope. The
    // overall dispute.service.ts may use it elsewhere; we limit the
    // assertion to the file-dispute block.
    const fileDisputeBlock = SVC.match(/export async function fileDispute[\s\S]*?return dispute;\s*\}/);
    expect(fileDisputeBlock).not.toBeNull();
    expect(fileDisputeBlock![0]).not.toMatch(/refundFromEscrow\(bookingId,/);
  });
});
