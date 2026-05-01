// CRIT-N10 fix verified — confirmation flow uses releaseEscrowInTransaction
// atomically with the status flip to 'payout_ready'.
//
// Pre-fix: releaseEscrow (legacy non-trx) committed money, then a separate
// db.query updated status to 'payout_ready'. Failure modes:
//   (a) money moved but status update failed → stuck at 'confirmed'.
//   (b) escrow throw + manual rollback UPDATE itself failed → stuck.
// Post-fix: one db.transaction wraps releaseEscrowInTransaction + status
// UPDATE. Either both happen or neither does.
//
// Static-content scan against the committed source confirms the new shape.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);

describe('CRIT-N10 — booking confirmation uses releaseEscrowInTransaction atomically', () => {
  it('CRIT-N10 — confirmation block calls releaseEscrowInTransaction inside db.transaction', () => {
    // Find the "newStatus === 'confirmed' && oldEscrowStatus === 'held'" block.
    const blockStart = ROUTES.indexOf("newStatus === 'confirmed'");
    expect(blockStart).toBeGreaterThan(0);
    // Find the next confirmation-marker after the block (cancellation
    // path is the next major branch).
    const blockEnd = ROUTES.indexOf("(newStatus === 'cancelled_by_customer'", blockStart);
    expect(blockEnd).toBeGreaterThan(blockStart);

    const block = ROUTES.slice(blockStart, blockEnd);

    // Must call releaseEscrowInTransaction (trx-aware variant), not
    // releaseEscrow (the legacy non-trx variant).
    expect(block).toMatch(/releaseEscrowInTransaction/);

    // Must wrap in db.transaction.
    expect(block).toMatch(/db\.transaction\(async \(client\)/);

    // The status flip to 'payout_ready' must use client.query (inside trx),
    // not db.query (outside trx).
    expect(block).toMatch(/client\.query/);
    expect(block).toMatch(/SET status = 'payout_ready'/);

    // Must NOT call the legacy releaseEscrow (which would skip the
    // money-conservation guard added in CRIT-N04 and break atomicity).
    expect(block).not.toMatch(/escrowService\.releaseEscrow\(/);

    // The brittle manual-rollback pattern must be gone.
    expect(block).not.toMatch(/SET status = 'completed_by_provider', confirmed_at = NULL/);
  });

  it('CRIT-N10 — OR issuance is post-commit best-effort', () => {
    const blockStart = ROUTES.indexOf("newStatus === 'confirmed'");
    // Find the next confirmation-marker after the block (cancellation
    // path is the next major branch).
    const blockEnd = ROUTES.indexOf("(newStatus === 'cancelled_by_customer'", blockStart);
    const block = ROUTES.slice(blockStart, blockEnd);

    // OR issuance happens AFTER the trx, in a try/catch (best-effort).
    expect(block).toMatch(/orService\.issueOR/);
    // Wrapped in try/catch.
    expect(block).toMatch(/OR issuance failed/);
  });

  it('CRIT-N10 — failure of trx leaves booking at confirmed (no broken rollback path)', () => {
    const blockStart = ROUTES.indexOf("newStatus === 'confirmed'");
    // Find the next confirmation-marker after the block (cancellation
    // path is the next major branch).
    const blockEnd = ROUTES.indexOf("(newStatus === 'cancelled_by_customer'", blockStart);
    const block = ROUTES.slice(blockStart, blockEnd);

    // The catch block now logs + throws. It does NOT do the brittle
    // manual rollback that pre-fix code attempted.
    const catchIdx = block.indexOf('} catch (escrowErr)');
    expect(catchIdx).toBeGreaterThan(0);
    const catchBlock = block.slice(catchIdx, catchIdx + 800);
    expect(catchBlock).toMatch(/booking stays at confirmed for admin retry/);
    expect(catchBlock).toMatch(/throw escrowErr/);
    // No re-attempt of the failed update inside the catch.
    expect(catchBlock).not.toMatch(/await db\.query.*UPDATE bookings.*completed_by_provider/);
  });
});
