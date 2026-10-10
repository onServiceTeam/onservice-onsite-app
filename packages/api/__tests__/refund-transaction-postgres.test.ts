import crypto from 'node:crypto';
import request from 'supertest';
import '../src/config/pg-types.config';
import { db } from '../src/models/db';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import { processRetries } from '../src/services/gateway-retry.service';
import { processRefund } from '../src/services/payment.service';
import { logger } from '../src/utils/logger';
import {
  bookingIntegrationIt, customerA, customerB, customerWalletA, customerWalletB, escrowWallet,
  bookingA, bookingB, operatorId, ticketId, otherTicketId, requestKey, secondKey,
  providerUserA, providerUserB, providerA, providerB, refundBody, assertRefundTestIdentity,
  withRefundDatabase, snapshot, withOperatorRefundDatabase, refundHttp, operatorSnapshot,
  withParticipantRefundDatabase, participantHttp, withStaffJobListDatabase, staffJobsHttp,
  participantSnapshot,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const refundIt = bookingIntegrationIt;

async function refund(amount: number) {
  return db.transaction(client => refundFromEscrowInTransaction(
    client, bookingA, amount, 'Synthetic support refund',
  ));
}

refundIt('Bug SEC-076 - unassigned providers cannot cancel or start paid bookings through HTTP', async () => {
  await withParticipantRefundDatabase(async database => {
    const before = await participantSnapshot(database);
    const patch = participantHttp(providerUserA, 'provider');
    const cancelled = await patch(bookingA, 'cancelled_by_provider');
    const started = await patch(bookingB, 'provider_en_route');
    expect({ responses: [cancelled.status, started.status], state: await participantSnapshot(database) })
      .toEqual({ responses: [403, 403], state: before });
    expect(cancelled.body.error.message).toBe('You are not assigned to this booking.');
    expect(started.body.error.message).toBe('You are not assigned to this booking.');
  });
}, 30000);

refundIt('Bug SEC-077 - privacy officers cannot fall through booking actor guards to cancel or start funded jobs', async () => {
  await withParticipantRefundDatabase(async database => {
    await database.query("UPDATE users SET role='dpo' WHERE id=$1", [operatorId]);
    const before = await participantSnapshot(database);
    const patch = participantHttp(operatorId, 'dpo');
    const cancelled = await patch(bookingA, 'cancelled_by_provider');
    const started = await patch(bookingB, 'provider_en_route');
    expect({ responses: [cancelled.status, started.status], state: await participantSnapshot(database) })
      .toEqual({ responses: [403, 403], state: before });
    expect(cancelled.body.error.message).toBe('Your role cannot change booking status.');
    expect(started.body.error.message).toBe('Your role cannot change booking status.');
  });
}, 30000);

refundIt('assigned approved staff retain on-site authority without gaining cancellation or unrelated-job authority', async () => {
  await withParticipantRefundDatabase(async database => {
    const staffUserId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    // Focused D23 relationships/approval fixture, not a full migration rehearsal.
    await database.query(`CREATE TABLE provider_staff (
      id uuid PRIMARY KEY, provider_id uuid NOT NULL REFERENCES providers(id),
      user_id uuid REFERENCES users(id), status text NOT NULL CHECK (status IN
        ('invited','pending_review','approved','rejected','suspended','deactivated')));
      ALTER TABLE bookings ADD COLUMN performer_staff_id uuid REFERENCES provider_staff(id);`);
    await database.query("INSERT INTO users(id,role) VALUES ($1,'provider_staff')", [staffUserId]);
    await database.query("INSERT INTO provider_staff(id,provider_id,user_id,status) VALUES ($1,$2,$3,'approved')",
      [staffId, providerB, staffUserId]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2,performer_staff_id=$3 WHERE id=$1',
        [bookingB, providerB, staffId]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const patch = participantHttp(staffUserId, 'provider_staff');
    const before = await participantSnapshot(database);
    for (const [bookingId, status] of [
      [bookingA, 'provider_en_route'], [bookingB, 'cancelled_by_provider'],
    ] as const) {
      expect((await patch(bookingId, status)).status).toBe(403);
      expect(await participantSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE provider_staff SET status='suspended' WHERE id=$1", [staffId]);
    expect((await patch(bookingB, 'provider_en_route')).status).toBe(403);
    expect(await participantSnapshot(database)).toEqual(before);
    await database.query("UPDATE provider_staff SET status='approved' WHERE id=$1", [staffId]);
    const accepted = await patch(bookingB, 'provider_en_route');
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ id: bookingB, providerId: providerB, status: 'provider_en_route' });
    expect((await database.query('SELECT status,performer_staff_id FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'provider_en_route', performer_staff_id: staffId }]);
    expect(await snapshot(database)).toEqual({ wallets: before.wallets, ledger: before.ledger });
    expect((await database.query('SELECT user_id,type,data FROM notifications')).rows).toEqual([
      { user_id: customerB, type: 'provider_en_route', data: expect.objectContaining({ bookingId: bookingB }) },
    ]);
  });
}, 30000);

refundIt('Bug SEC-078 - approved staff cannot start bookings without their own parent-provider assignment', async () => {
  await withParticipantRefundDatabase(async database => {
    const staffUserId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    // Deliberately inconsistent historical-style relationships. Individual
    // D23 foreign keys accept these rows; the normal assignment service does
    // not create them. Approval alone must not authorize another provider's job.
    await database.query(`CREATE TABLE provider_staff (
      id uuid PRIMARY KEY, provider_id uuid NOT NULL REFERENCES providers(id),
      user_id uuid REFERENCES users(id), status text NOT NULL CHECK (status IN
        ('invited','pending_review','approved','rejected','suspended','deactivated')));
      ALTER TABLE bookings ADD COLUMN performer_staff_id uuid REFERENCES provider_staff(id);`);
    await database.query("INSERT INTO users(id,role) VALUES ($1,'provider_staff')", [staffUserId]);
    await database.query("INSERT INTO provider_staff(id,provider_id,user_id,status) VALUES ($1,$2,$3,'approved')",
      [staffId, providerB, staffUserId]);
    await database.query('UPDATE bookings SET performer_staff_id=$1 WHERE id IN ($2,$3)',
      [staffId, bookingA, bookingB]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerA]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerA, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);
    const staffBefore = (await database.query('SELECT * FROM provider_staff ORDER BY id')).rows;
    const patch = participantHttp(staffUserId, 'provider_staff');
    const absentParent = await patch(bookingA, 'provider_en_route');
    const otherParent = await patch(bookingB, 'provider_en_route');
    expect({ responses: [absentParent.status, otherParent.status], state: await participantSnapshot(database) })
      .toEqual({ responses: [403, 403], state: before });
    expect(absentParent.body.error.message).toBe('This job is not assigned to you.');
    expect(otherParent.body.error.message).toBe('This job is not assigned to you.');
    expect((await database.query('SELECT * FROM provider_staff ORDER BY id')).rows).toEqual(staffBefore);
  });
}, 30000);

refundIt('Bug SEC-079 - staff job list excludes retained performers without the same parent-provider assignment', async () => {
  await withStaffJobListDatabase(async (database, staffUserId) => {
    const http = staffJobsHttp(staffUserId);
    const disclosed: unknown[] = [];
    // D23 permits each foreign key independently. The normal assignment
    // service rejects these relationships, but a read must not disclose them.
    for (const otherParent of [null, providerA]) {
      await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, otherParent]);
      const before = await participantSnapshot(database);
      const staffBefore = (await database.query('SELECT * FROM provider_staff ORDER BY id')).rows;
      const response = await http();
      expect(response.status).toBe(200);
      disclosed.push(response.body.data);
      expect(await participantSnapshot(database)).toEqual(before);
      expect((await database.query('SELECT * FROM provider_staff ORDER BY id')).rows).toEqual(staffBefore);
    }
    const ownJob = {
      id: bookingA, status: 'paid', scheduledAt: expect.any(String),
      address: 'Synthetic address A', barangay: 'Synthetic barangay', city: 'Cebu City',
      serviceName: 'Synthetic turnover', customerName: 'Synthetic Customer A',
      providerBusinessName: 'Synthetic team B',
    };
    expect(disclosed).toEqual([[ownJob], [ownJob]]);
  });
}, 30000);

refundIt('staff job list preserves approved same-provider ordering and rejects revoked memberships and credentials', async () => {
  await withStaffJobListDatabase(async (database, staffUserId, staffId) => {
    await database.query("UPDATE bookings SET provider_id=$2,status='in_progress' WHERE id=$1", [bookingB, providerB]);
    const before = await participantSnapshot(database);
    const http = staffJobsHttp(staffUserId);
    const assigned = await http();
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.map((job: { id: string }) => job.id)).toEqual([bookingB, bookingA]);
    expect(assigned.body.data[0]).toMatchObject({
      status: 'in_progress', address: 'Synthetic address B', serviceName: 'Synthetic turnover',
      customerName: 'Synthetic Customer B', providerBusinessName: 'Synthetic team B',
    });
    for (const status of ['invited', 'pending_review', 'rejected', 'suspended', 'deactivated']) {
      await database.query('UPDATE provider_staff SET status=$2 WHERE id=$1', [staffId, status]);
      const denied = await http();
      expect(denied.status).toBe(200);
      expect(denied.body.data).toEqual([]);
      expect(await participantSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE provider_staff SET status='approved' WHERE id=$1", [staffId]);
    for (const type of ['refresh', '2fa_pending', '2fa_setup']) {
      expect((await staffJobsHttp(staffUserId, 'provider_staff', { type })()).status).toBe(401);
    }
    for (const role of ['customer', 'provider', 'admin', 'super_admin']) {
      await database.query('UPDATE users SET role=$2 WHERE id=$1', [staffUserId, role]);
      expect((await staffJobsHttp(staffUserId, role)()).status).toBe(403);
    }
    await database.query("UPDATE users SET role='provider_staff',session_version=2 WHERE id=$1", [staffUserId]);
    expect((await http()).status).toBe(401);
    await database.query('UPDATE users SET session_version=1,is_active=FALSE WHERE id=$1', [staffUserId]);
    expect((await http()).status).toBe(401);
    await database.query('UPDATE users SET is_active=TRUE WHERE id=$1', [staffUserId]);
    await database.query('UPDATE bookings SET performer_staff_id=NULL');
    const cleared = await participantSnapshot(database);
    expect((await http()).body.data).toEqual([]);
    expect(await participantSnapshot(database)).toEqual(cleared);
  });
}, 30000);

refundIt('admin and super admin keep the on-site en-route step on the status route while D35 Q1 is open', async () => {
  for (const role of ['admin', 'super_admin']) {
    await withParticipantRefundDatabase(async database => {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, operatorId]);
      const before = await participantSnapshot(database);
      const response = await participantHttp(operatorId, role)(bookingB, 'provider_en_route');
      expect(response.status).toBe(200);
      expect((await database.query('SELECT status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'provider_en_route' }]);
      expect(await snapshot(database)).toEqual({ wallets: before.wallets, ledger: before.ledger });
      expect((await database.query('SELECT user_id,type,data FROM notifications')).rows).toEqual([
        { user_id: customerB, type: 'provider_en_route', data: expect.objectContaining({ bookingId: bookingB }) },
      ]);
    });
  }
}, 30000);

refundIt('assigned-provider ownership remains enforced and the actual owner can start their job', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);
    const other = await participantHttp(providerUserA, 'provider')(bookingB, 'cancelled_by_provider');
    expect(other.status).toBe(403);
    expect(await participantSnapshot(database)).toEqual(before);
    const own = await participantHttp(providerUserB, 'provider')(bookingB, 'provider_en_route');
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ id: bookingB, providerId: providerB, status: 'provider_en_route' });
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'provider_en_route', escrow_status: 'held' }]);
    expect(await snapshot(database)).toEqual({ wallets: before.wallets, ledger: before.ledger });
    expect((await database.query('SELECT user_id,type,data FROM notifications')).rows).toEqual([
      { user_id: customerB, type: 'provider_en_route', data: expect.objectContaining({ bookingId: bookingB }) },
    ]);
  });
}, 30000);

refundIt('participant HTTP rejects non-access or revoked provider credentials before changing funded bookings', async () => {
  await withParticipantRefundDatabase(async database => {
    const before = await participantSnapshot(database);
    for (const type of ['refresh', '2fa_pending', '2fa_setup']) {
      const response = await participantHttp(providerUserA, 'provider', { type })(bookingA, 'cancelled_by_provider');
      expect(response.status).toBe(401);
      expect(await participantSnapshot(database)).toEqual(before);
    }
    await database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [providerUserA]);
    const response = await participantHttp(providerUserA, 'provider')(bookingA, 'cancelled_by_provider');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('session_revoked');
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 30000);

refundIt('owning customer cancellation returns a late unassigned wallet booking including its full fee', async () => {
  await withParticipantRefundDatabase(async database => {
    const before = await participantSnapshot(database);
    const response = await participantHttp(customerA, 'customer')(bookingA, 'cancelled_by_customer');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: bookingA, status: 'cancelled_by_customer' });
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingA])).rows)
      .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'refunded' }]);
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
      .toEqual([{ available_balance: '250000' }]);
    expect((await database.query('SELECT status,refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingA])).rows)
      .toEqual([{ status: 'refunded', refunded_amount: '100000' }]);
    expect((await snapshot(database)).ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    expect((await database.query('SELECT * FROM notifications')).rows).toEqual([]);
  });
}, 30000);

it('refund fixture requires the actual loopback peer and exact requested test database', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    expect(() => assertRefundTestIdentity(peer, 'refund_test', 'refund_test')).not.toThrow();
  }
  for (const peer of [undefined, '', 'localhost', '127.0.0.1.example.invalid', '172.18.0.2', '203.0.113.7']) {
    expect(() => assertRefundTestIdentity(peer, 'refund_test', 'refund_test')).toThrow();
  }
  for (const [expected, actual] of [
    ['refund_test', undefined], ['refund_test', 'another_test'], ['refund_test', 'onservice'],
    ['onservice', 'onservice'],
  ]) {
    expect(() => assertRefundTestIdentity('127.0.0.1', expected!, actual)).toThrow();
  }
});

refundIt('wallet refund returns the full original payment without touching another booking', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    const result = await refund(100000);
    expect(result).toEqual({ remainingEscrowCentavos: 0, paymentMethod: 'wallet', customerWalletCredited: true });
    const balances = await database.query(`SELECT id,available_balance::text,pending_balance::text
      FROM wallets ORDER BY id`);
    expect(balances.rows).toEqual([
      { id: escrowWallet, available_balance: '0', pending_balance: '1000000' },
      { id: customerWalletA, available_balance: '250000', pending_balance: '0' },
      { id: customerWalletB, available_balance: '1000000', pending_balance: '0' },
    ]);
    const movements = await database.query(`SELECT wallet_id,amount::text,balance_after::text,reference_id
      FROM wallet_transactions WHERE booking_id=$1 AND type='refund' ORDER BY wallet_id`, [bookingA]);
    expect(movements.rows).toEqual([
      { wallet_id: escrowWallet, amount: '-100000', balance_after: '1000000', reference_id: null },
      { wallet_id: customerWalletA, amount: '100000', balance_after: '250000', reference_id: bookingA },
    ]);
    expect((await database.query(`SELECT SUM(amount)::text AS amount FROM wallet_transactions
      WHERE booking_id=$1 AND type='refund'`, [bookingA])).rows).toEqual([{ amount: '0' }]);
    expect((await snapshot(database)).ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    const after = await snapshot(database);
    await expect(refund(100000)).rejects.toMatchObject({ statusCode: 409 });
    expect(await snapshot(database)).toEqual(after);
  });
}, 30000);

refundIt('booking-scoped cap rejects excessive and concurrent refunds despite shared escrow funds', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    await expect(refund(100001)).rejects.toMatchObject({ statusCode: 409 });
    expect(await snapshot(database)).toEqual(before);
    const outcomes = await Promise.allSettled([refund(70000), refund(70000)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find(outcome => outcome.status === 'rejected');
    expect(rejection).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });
    expect((await database.query(`SELECT SUM(amount)::text AS remaining FROM wallet_transactions
      WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingA])).rows)
      .toEqual([{ remaining: '30000' }]);
    expect((await database.query(`SELECT available_balance::text AS amount FROM wallets WHERE id=$1`,
      [customerWalletA])).rows).toEqual([{ amount: '220000' }]);
    expect((await snapshot(database)).ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
  });
}, 30000);

refundIt('customer refund-ledger failure rolls back both balances and permits the same refund after repair', async () => {
  await withRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_customer_refund() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.wallet_id='${customerWalletA}'::uuid AND NEW.type='refund' THEN
        RAISE EXCEPTION 'Synthetic customer refund ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_customer_refund BEFORE INSERT ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION reject_customer_refund();`);
    const before = await snapshot(database);
    await expect(refund(100000)).rejects.toMatchObject({ code: 'P0001' });
    expect(await snapshot(database)).toEqual(before);
    await database.query('DROP TRIGGER reject_customer_refund ON wallet_transactions');
    await expect(refund(100000)).resolves.toMatchObject({ remainingEscrowCentavos: 0, customerWalletCredited: true });
    expect((await database.query(`SELECT count(*)::int AS count FROM wallet_transactions
      WHERE booking_id=$1 AND type='refund'`, [bookingA])).rows).toEqual([{ count: 2 }]);
    expect((await database.query('SELECT available_balance::text AS amount FROM wallets WHERE id=$1',
      [customerWalletA])).rows).toEqual([{ amount: '250000' }]);
  });
}, 30000);

refundIt('invalid refund amounts leave all customer and escrow data unchanged', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    for (const amount of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(refund(amount)).rejects.toMatchObject({ statusCode: 400 });
      expect(await snapshot(database)).toEqual(before);
    }
  });
}, 30000);

refundIt('operator HTTP partial refund links case, ledger and accounting and replays without another movement', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    const http = refundHttp();
    const first = await http.post();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      bookingId: bookingA, refundedAmount: 25000, supportTicketId: ticketId,
      remainingEscrowAmount: 75000, customerWalletCredited: true,
      idempotentReplay: false, paymentProcessingStatus: 'processed', paymentProcessingQueued: false,
    });
    const committed = await operatorSnapshot(database);
    expect(committed.audits).toHaveLength(1);
    expect(committed.audits[0]).toMatchObject({
      id: first.body.data.adminActionId, admin_id: operatorId, action_type: 'refund_issued',
      target_id: bookingA, reason: refundBody.reason,
      details: { bookingId: bookingA, supportTicketId: ticketId, idempotencyKey: requestKey,
        refundAmount: 25000, remainingEscrowAmount: 75000 },
    });
    expect(committed.messages).toHaveLength(1);
    expect(committed.messages[0]).toMatchObject({
      ticket_id: ticketId, sender_id: operatorId, sender_role: 'super_admin', is_internal_note: true,
      message: expect.stringContaining(first.body.data.adminActionId),
    });
    expect(committed.retry).toHaveLength(1);
    expect(committed.retry[0]).toMatchObject({
      id: committed.audits[0].details.paymentRetryId,
      booking_id: bookingA, action_type: 'process_payment_refund', amount_centavos: 25000, status: 'succeeded',
    });
    expect(committed.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(committed.bookings.find(row => row.id === bookingA)).toMatchObject({ escrow_status: 'partially_refunded' });
    expect(committed.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
    expect(committed.ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    expect(committed.intents.find(row => row.booking_id === bookingB))
      .toEqual(before.intents.find(row => row.booking_id === bookingB));

    const money = await http.money();
    expect(money.status).toBe(200);
    expect(money.body.data.paymentIntents).toHaveLength(1);
    expect(money.body.data.paymentIntents[0]).toMatchObject({
      amount: 100000, refundedAmount: 25000, paymentMethod: 'wallet', status: 'partially_refunded',
    });
    expect(money.body.data.ledgerEntries.filter((row: { type: string }) => row.type === 'refund'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ walletType: 'customer', amount: 25000 }),
        expect.objectContaining({ walletType: 'platform_escrow', amount: -25000 }),
      ]));

    // Case closure after a committed operation must not turn a retry into a
    // second operation or require a fabricated new active case.
    await database.query("UPDATE support_tickets SET status='closed' WHERE id=$1", [ticketId]);
    const closed = await operatorSnapshot(database);
    const replay = await http.post();
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual({ ...first.body.data, idempotentReplay: true });
    expect(await operatorSnapshot(database)).toEqual(closed);
    for (const [body, bookingId] of [
      [{ ...refundBody, amount: 26000 }, bookingA],
      [{ ...refundBody, reason: 'Different support-approved reason' }, bookingA],
      [{ ...refundBody, supportTicketId: otherTicketId }, bookingA],
      [refundBody, bookingB],
    ] as const) {
      expect((await http.post(body, bookingId)).status).toBe(409);
      expect(await operatorSnapshot(database)).toEqual(closed);
    }
    await database.query("UPDATE support_tickets SET status='open' WHERE id=$1", [ticketId]);
    const remainder = await http.post({ ...refundBody, amount: 75000, idempotencyKey: secondKey });
    expect(remainder.status).toBe(200);
    expect(remainder.body.data).toMatchObject({ remainingEscrowAmount: 0, idempotentReplay: false });
    const final = await operatorSnapshot(database);
    expect(final.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '250000' });
    expect(final.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 100000, status: 'refunded' });
    expect(final.bookings.find(row => row.id === bookingA)).toMatchObject({ escrow_status: 'refunded' });
    expect(final.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(4);
  });
}, 30000);

refundIt('operator refund HTTP role, purpose, current authority, CSRF and case guards preserve money', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'dpo']) {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, operatorId]);
      expect((await refundHttp(role).post()).status).toBe(403);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE users SET role='super_admin' WHERE id=$1", [operatorId]);
    expect((await refundHttp('super_admin', { type: 'pre_auth_2fa_setup' }).post()).status).toBe(401);
    await database.query('UPDATE users SET session_version=2 WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(401);
    await database.query('UPDATE users SET session_version=1,is_active=FALSE WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(401);
    await database.query('UPDATE users SET is_active=TRUE,must_rotate_password=TRUE WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(428);
    await database.query('UPDATE users SET must_rotate_password=FALSE WHERE id=$1', [operatorId]);
    expect(await operatorSnapshot(database)).toEqual(before);

    const http = refundHttp();
    for (const csrf of [undefined, 'wrong-csrf', 'synthetic-csrf']) {
      expect((await http.cookiePost(csrf)).status).toBe(403);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    for (const [body, expectedStatus] of [
      [{ ...refundBody, amount: 0 }, 400], [{ ...refundBody, amount: 0.5 }, 400],
      [{ ...refundBody, amount: 100001 }, 409], [{ ...refundBody, reason: 'short' }, 400],
      [{ ...refundBody, supportTicketId: 'invalid' }, 400],
      [{ ...refundBody, idempotencyKey: 'invalid' }, 400],
      [{ ...refundBody, supportTicketId: otherTicketId }, 409],
    ] as const) {
      expect((await http.post(body)).status).toBe(expectedStatus);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE support_tickets SET status='resolved' WHERE id=$1", [ticketId]);
    const resolved = await operatorSnapshot(database);
    expect((await http.post()).status).toBe(409);
    expect(await operatorSnapshot(database)).toEqual(resolved);
    await database.query("UPDATE support_tickets SET status='open' WHERE id=$1", [ticketId]);
    await database.query(`INSERT INTO admin_csrf_tokens(admin_user_id,token,expires_at)
      VALUES ($1,'synthetic-csrf',NOW()+INTERVAL '5 minutes')`, [operatorId]);
    expect((await http.cookiePost('synthetic-csrf')).status).toBe(200);
    expect((await operatorSnapshot(database)).audits).toHaveLength(1);
  });
}, 30000);

refundIt('operator outbox, audit or support-note SQL failure rolls back the whole local refund before retry', async () => {
  for (const target of ['gateway_retry_queue', 'admin_actions', 'support_ticket_messages']) {
    await withOperatorRefundDatabase(async database => {
      await database.query(`CREATE FUNCTION reject_operator_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic operator persistence failure'; END $$;
        CREATE TRIGGER reject_operator_write BEFORE INSERT ON ${target}
          FOR EACH ROW EXECUTE FUNCTION reject_operator_write();`);
      const before = await operatorSnapshot(database);
      const http = refundHttp();
      const failed = await http.post();
      expect(failed.status).toBe(500);
      expect(failed.body.error.message).toBe('An unexpected error occurred. Please try again later.');
      expect(await operatorSnapshot(database)).toEqual(before);
      await database.query(`DROP TRIGGER reject_operator_write ON ${target}`);
      expect((await http.post()).status).toBe(200);
      const after = await operatorSnapshot(database);
      expect(after.audits).toHaveLength(1);
      expect(after.retry).toHaveLength(1);
      expect(after.messages).toHaveLength(1);
      expect(after.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(2);
    });
  }
}, 30000);

refundIt('concurrent operator HTTP requests sharing a partial-refund key commit one operation', async () => {
  await withOperatorRefundDatabase(async database => {
    const http = refundHttp();
    const responses = await Promise.all([http.post(), http.post()]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(responses.map(response => response.body.data.idempotentReplay).sort()).toEqual([false, true]);
    expect(new Set(responses.map(response => response.body.data.adminActionId)).size).toBe(1);
    const after = await operatorSnapshot(database);
    expect(after.audits).toHaveLength(1);
    expect(after.messages).toHaveLength(1);
    expect(after.retry).toHaveLength(1);
    expect(after.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(2);
    expect(after.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 25000 });
    expect(after.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
  });
}, 30000);

refundIt('concurrent distinct operator refund keys cannot spend another booking escrow to bypass the cap', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    const http = refundHttp();
    const responses = await Promise.all([
      http.post({ ...refundBody, amount: 70000 }),
      http.post({ ...refundBody, amount: 70000, idempotencyKey: secondKey }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const after = await operatorSnapshot(database);
    expect(after.audits).toHaveLength(1);
    expect(after.retry).toHaveLength(1);
    expect(after.messages).toHaveLength(1);
    expect(after.ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    expect(after.intents.find(row => row.booking_id === bookingB))
      .toEqual(before.intents.find(row => row.booking_id === bookingB));
    expect(after.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '220000' });
    expect(after.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 70000 });
  });
}, 30000);

refundIt('Bug OPS-536 - overlapping refunds on one support case finish without a shared-lock upgrade deadlock', async () => {
  for (const amount of [25000, 70000]) {
    await withOperatorRefundDatabase(async database => {
      jest.mocked(logger.error).mockClear();
      const before = await operatorSnapshot(database);
      const blocker = await database.connect();
      const http = refundHttp();
      const requests: Array<Promise<request.Response>> = [];
      let responses: request.Response[];
      let transactionOpen = false;
      try {
        await blocker.query('BEGIN');
        transactionOpen = true;
        await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingA]);
        requests.push(
          http.post({ ...refundBody, amount }).then(response => response),
          http.post({ ...refundBody, amount, idempotencyKey: secondKey }).then(response => response),
        );
        // Hold the real booking row until both HTTP transactions are waiting.
        // Before repair both held SHARE on the case and waited for this row;
        // afterward one waits on the case's exclusive lock instead. Observe
        // actual PostgreSQL waits, not an assumed sleep or mocked SQL result.
        const deadline = Date.now() + 10000;
        let waiting = 0;
        while (waiting < 2 && Date.now() < deadline) {
          const state = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS count
            FROM pg_stat_activity WHERE datname=current_database()
              AND application_name=current_setting('application_name')
              AND wait_event_type='Lock' AND state='active'
              AND (query LIKE '%FROM bookings%' OR query LIKE '%FROM support_tickets%')`);
          waiting = state.rows[0]!.count;
          if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(2);
        await blocker.query('COMMIT');
        transactionOpen = false;
        responses = await Promise.all(requests);
      } finally {
        if (transactionOpen) await blocker.query('ROLLBACK');
        blocker.release();
        // Let owned requests finish before the schema/client fixture closes,
        // including when the lock-observation assertion itself fails.
        await Promise.allSettled(requests);
      }
      expect({ statuses: responses.map(response => response.status).sort(),
        errors: jest.mocked(logger.error).mock.calls.filter(call => call[0] === 'Request error'),
      }).toEqual({ statuses: amount === 25000 ? [200, 200] : [200, 409], errors: [] });
      const after = await operatorSnapshot(database);
      const count = amount === 25000 ? 2 : 1;
      expect(after.audits).toHaveLength(count);
      expect(after.messages).toHaveLength(count);
      expect(after.retry).toHaveLength(count);
      expect(after.retry.every(row => row.status === 'succeeded')).toBe(true);
      expect(after.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(count * 2);
      expect(after.wallets.find(row => row.id === customerWalletA))
        .toMatchObject({ available_balance: String(150000 + amount * count) });
      expect(after.intents.find(row => row.booking_id === bookingA))
        .toMatchObject({ refunded_amount: amount * count });
      expect(after.ledger.filter(row => row.booking_id === bookingB))
        .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
      expect(after.intents.find(row => row.booking_id === bookingB))
        .toEqual(before.intents.find(row => row.booking_id === bookingB));
      const succeeded = responses.find(response => response.status === 200)!;
      const successfulKey = after.audits.find(row => row.id === succeeded.body.data.adminActionId)!.details.idempotencyKey;
      expect((await http.post({ ...refundBody, amount, idempotencyKey: successfulKey })).body.data)
        .toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
      expect(await operatorSnapshot(database)).toEqual(after);
    });
  }
}, 30000);

refundIt('a blocked refund case leaves other cases usable and rechecks closure after the lock wait', async () => {
  for (const status of ['resolved', 'closed']) {
    await withOperatorRefundDatabase(async database => {
      const blocker = await database.connect();
      const http = refundHttp();
      let blocked: Promise<request.Response> | undefined;
      let transactionOpen = false;
      try {
        await blocker.query('BEGIN');
        transactionOpen = true;
        await blocker.query('SELECT id FROM support_tickets WHERE id=$1 FOR NO KEY UPDATE', [ticketId]);
        blocked = http.post().then(response => response);
        const deadline = Date.now() + 10000;
        let waiting = 0;
        while (waiting < 1 && Date.now() < deadline) {
          const state = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS count
            FROM pg_stat_activity WHERE datname=current_database()
              AND application_name=current_setting('application_name')
              AND wait_event_type='Lock' AND state='active'
              AND query LIKE '%FROM support_tickets%'`);
          waiting = state.rows[0]!.count;
          if (waiting < 1) await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(1);
        // Complete an unrelated booking/case refund while case A stays locked.
        const other = await http.post({ ...refundBody, supportTicketId: otherTicketId, idempotencyKey: secondKey }, bookingB);
        expect(other.status).toBe(200);
        expect(other.body.data).toMatchObject({ paymentProcessingStatus: 'processed', customerWalletCredited: true });
        const expected = await operatorSnapshot(database);
        expect(expected.audits).toHaveLength(1);
        expect(expected.wallets.find(row => row.id === customerWalletB)).toMatchObject({ available_balance: '1025000' });
        const closed = await blocker.query('UPDATE support_tickets SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *',
          [ticketId, status]);
        expected.cases = expected.cases.map(row => row.id === ticketId ? closed.rows[0] : row);
        await blocker.query('COMMIT');
        transactionOpen = false;
        expect((await blocked).status).toBe(409);
        expect(await operatorSnapshot(database)).toEqual(expected);
      } finally {
        if (transactionOpen) await blocker.query('ROLLBACK');
        blocker.release();
        if (blocked) await Promise.allSettled([blocked]);
      }
    });
  }
}, 30000);

refundIt('actual payment-only worker repairs failed wallet accounting without repeating the committed operator refund', async () => {
  await withOperatorRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_refund_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic refund accounting failure'; END $$;
      CREATE TRIGGER reject_refund_accounting BEFORE UPDATE ON payment_intents
        FOR EACH ROW EXECUTE FUNCTION reject_refund_accounting();`);
    const http = refundHttp();
    const first = await http.post();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      customerWalletCredited: true, paymentProcessingQueued: true, paymentProcessingStatus: 'queued',
    });
    const committed = await operatorSnapshot(database);
    expect(committed.retry[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(committed.intents.find(row => row.booking_id === bookingA)).toMatchObject({ status: 'succeeded', refunded_amount: 0 });
    expect(committed.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
    const replay = await http.post();
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'queued' });
    expect(await operatorSnapshot(database)).toEqual(committed);
    await database.query('DROP TRIGGER reject_refund_accounting ON payment_intents');
    await database.query("UPDATE gateway_retry_queue SET next_retry_at=NOW()-INTERVAL '1 second'");
    expect(await processRetries()).toEqual({ attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0 });
    const repaired = await operatorSnapshot(database);
    expect(repaired.wallets).toEqual(committed.wallets);
    expect(repaired.ledger).toEqual(committed.ledger);
    expect(repaired.audits).toEqual(committed.audits);
    expect(repaired.messages).toEqual(committed.messages);
    expect(repaired.intents.find(row => row.booking_id === bookingA)).toMatchObject({ status: 'partially_refunded', refunded_amount: 25000 });
    expect(repaired.retry[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(await processRetries()).toEqual({ attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 });
    expect(await operatorSnapshot(database)).toEqual(repaired);
    expect((await http.post()).body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
    expect(await operatorSnapshot(database)).toEqual(repaired);
  });
}, 30000);

refundIt('Bug OPS-533 — wallet refund retry acknowledgement failure cannot count a partial refund twice', async () => {
  await withOperatorRefundDatabase(async database => {
    // First leave the real operator outbox pending by refusing payment accounting.
    await database.query(`CREATE FUNCTION reject_refund_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic refund accounting failure'; END $$;
      CREATE TRIGGER reject_refund_accounting BEFORE UPDATE ON payment_intents
        FOR EACH ROW EXECUTE FUNCTION reject_refund_accounting();`);
    const http = refundHttp();
    expect((await http.post()).body.data).toMatchObject({
      customerWalletCredited: true, paymentProcessingStatus: 'queued',
    });
    const committed = await operatorSnapshot(database);
    expect(committed.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 0 });
    await database.query('DROP TRIGGER reject_refund_accounting ON payment_intents');

    // Refuse only the queue acknowledgement. Before repair it ran after the
    // payment helper committed; now both writes must roll back together.
    // No query result, gateway response or COMMIT is fabricated.
    await database.query(`CREATE FUNCTION reject_refund_acknowledgement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status='succeeded' THEN
        RAISE EXCEPTION 'Synthetic refund acknowledgement failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_refund_acknowledgement BEFORE UPDATE ON gateway_retry_queue
        FOR EACH ROW EXECUTE FUNCTION reject_refund_acknowledgement();`);
    await database.query("UPDATE gateway_retry_queue SET next_retry_at=NOW()-INTERVAL '1 second'");
    expect(await processRetries()).toEqual({ attempted: 1, succeeded: 0, failedAndRetrying: 1, failedPermanent: 0 });
    const unacknowledged = await operatorSnapshot(database);
    expect(unacknowledged.retry[0]).toMatchObject({ status: 'pending', attempts: 2 });
    expect(unacknowledged.wallets).toEqual(committed.wallets);
    expect(unacknowledged.ledger).toEqual(committed.ledger);
    expect(unacknowledged.audits).toEqual(committed.audits);
    expect(unacknowledged.messages).toEqual(committed.messages);
    expect(unacknowledged.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 0, status: 'succeeded' });
    await database.query('DROP TRIGGER reject_refund_acknowledgement ON gateway_retry_queue');
    await database.query("UPDATE gateway_retry_queue SET next_retry_at=NOW()-INTERVAL '1 second'");
    expect(await processRetries()).toEqual({ attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0 });
    const repaired = await operatorSnapshot(database);
    expect(repaired.wallets).toEqual(committed.wallets);
    expect(repaired.ledger).toEqual(committed.ledger);
    expect(repaired.audits).toEqual(committed.audits);
    expect(repaired.messages).toEqual(committed.messages);
    expect(repaired.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(repaired.retry[0]).toMatchObject({ status: 'succeeded', attempts: 3 });
    expect((await http.post()).body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
    expect(await operatorSnapshot(database)).toEqual(repaired);
  });
}, 30000);

refundIt('lost caller reply after a real wallet retry commit cannot reopen the completed outbox', async () => {
  for (const initialAttempts of [1, 4]) {
    await withOperatorRefundDatabase(async database => {
      await database.query(`CREATE FUNCTION reject_accounting_for_commit_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic initial accounting failure'; END $$;
        CREATE TRIGGER reject_accounting_for_commit_test BEFORE UPDATE ON payment_intents
          FOR EACH ROW EXECUTE FUNCTION reject_accounting_for_commit_test();`);
      const http = refundHttp();
      expect((await http.post()).body.data).toMatchObject({ paymentProcessingStatus: 'queued' });
      const committed = await operatorSnapshot(database);
      await database.query('DROP TRIGGER reject_accounting_for_commit_test ON payment_intents');
      await database.query("UPDATE gateway_retry_queue SET attempts=$1,next_retry_at=NOW()-INTERVAL '1 second'", [initialAttempts]);
      const realTransaction = db.transaction;
      const delivery = jest.spyOn(db, 'transaction').mockImplementationOnce(async callback => {
        await realTransaction(callback); // The real BEGIN, writes and COMMIT execute.
        throw new Error('Synthetic lost reply after the real PostgreSQL commit');
      });
      try {
        expect(await processRetries()).toEqual({ attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0 });
      } finally { delivery.mockRestore(); }
      const completed = await operatorSnapshot(database);
      expect(completed.retry[0]).toMatchObject({ status: 'succeeded', attempts: initialAttempts + 1 });
      expect(completed.intents.find(row => row.booking_id === bookingA))
        .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
      expect(completed.wallets).toEqual(committed.wallets);
      expect(completed.ledger).toEqual(committed.ledger);
      expect(completed.audits).toEqual(committed.audits);
      expect(completed.messages).toEqual(committed.messages);
      expect(await processRetries()).toEqual({ attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 });
      expect(await operatorSnapshot(database)).toEqual(completed);
      expect((await http.post()).body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
    });
  }
}, 30000);

refundIt('operator response reconciles an acknowledgement committed before a lost caller reply', async () => {
  await withOperatorRefundDatabase(async database => {
    const realTransaction = db.transaction;
    const delivery = jest.spyOn(db, 'transaction')
      .mockImplementationOnce(realTransaction)
      .mockImplementationOnce(async callback => {
        await realTransaction(callback);
        throw new Error('Synthetic lost reply after the real PostgreSQL commit');
      });
    let first;
    try { first = await refundHttp().post(); }
    finally { delivery.mockRestore(); }
    expect(first.status).toBe(200);
    const completed = await operatorSnapshot(database);
    expect(completed.retry[0]).toMatchObject({ status: 'succeeded', attempts: 1, last_error: null });
    expect(completed.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(first.body.data).toMatchObject({ paymentProcessingQueued: false, paymentProcessingStatus: 'processed' });
    expect(await processRetries()).toEqual({ attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 });
    expect(await operatorSnapshot(database)).toEqual(completed);
  });
}, 30000);

refundIt('wallet retry binds its operation and concurrent or completed deliveries preserve one accounting movement', async () => {
  await withOperatorRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_accounting_for_binding_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic initial accounting failure'; END $$;
      CREATE TRIGGER reject_accounting_for_binding_test BEFORE UPDATE ON payment_intents
        FOR EACH ROW EXECUTE FUNCTION reject_accounting_for_binding_test();`);
    const http = refundHttp();
    expect((await http.post()).body.data).toMatchObject({ paymentProcessingStatus: 'queued' });
    await database.query('DROP TRIGGER reject_accounting_for_binding_test ON payment_intents');
    const pending = await operatorSnapshot(database);
    const retryId = pending.retry[0].id as string;
    for (const [booking, amount, reason, context] of [
      [bookingB, 25000, refundBody.reason, { retryId, expectedStatus: 'pending' }],
      [bookingA, 26000, refundBody.reason, { retryId, expectedStatus: 'pending' }],
      [bookingA, 25000, 'A different reason', { retryId, expectedStatus: 'pending' }],
      [bookingA, 25000, refundBody.reason, { retryId, expectedStatus: 'in_progress' }],
      [bookingA, 25000, refundBody.reason, { retryId: crypto.randomUUID(), expectedStatus: 'pending' }],
    ] as const) {
      await expect(processRefund(booking, amount, reason, context)).rejects.toMatchObject({ statusCode: 409 });
      expect(await operatorSnapshot(database)).toEqual(pending);
    }
    const context = { retryId, expectedStatus: 'pending' as const };
    for (const action of ['release_escrow', 'release_partial_escrow', 'refund_from_escrow']) {
      await database.query('UPDATE gateway_retry_queue SET action_type=$1 WHERE id=$2', [action, retryId]);
      const differentAction = await operatorSnapshot(database);
      await expect(processRefund(bookingA, 25000, refundBody.reason, context)).rejects.toMatchObject({ statusCode: 409 });
      expect(await operatorSnapshot(database)).toEqual(differentAction);
    }
    await database.query("UPDATE gateway_retry_queue SET action_type='process_payment_refund' WHERE id=$1", [retryId]);
    expect(await operatorSnapshot(database)).toEqual(pending);
    expect(await Promise.all([
      processRefund(bookingA, 25000, refundBody.reason, context),
      processRefund(bookingA, 25000, refundBody.reason, context),
    ])).toEqual([{ retryAcknowledged: true }, { retryAcknowledged: true }]);
    const completed = await operatorSnapshot(database);
    expect(completed.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(completed.retry[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(completed.wallets).toEqual(pending.wallets);
    expect(completed.ledger).toEqual(pending.ledger);
    expect(completed.audits).toEqual(pending.audits);
    expect(completed.messages).toEqual(pending.messages);
    expect((await http.post({ ...refundBody, amount: 75000, idempotencyKey: secondKey })).status).toBe(200);
    const fullyRefunded = await operatorSnapshot(database);
    expect(fullyRefunded.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 100000, status: 'refunded' });
    await expect(processRefund(bookingA, 25000, refundBody.reason, context)).resolves.toEqual({ retryAcknowledged: true });
    expect(await operatorSnapshot(database)).toEqual(fullyRefunded);
  });
}, 30000);

refundIt('operator immediate wallet acknowledgement failure rolls back accounting before the same outbox retries', async () => {
  await withOperatorRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_immediate_refund_ack() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'Synthetic immediate refund acknowledgement failure';
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_immediate_refund_ack BEFORE UPDATE ON gateway_retry_queue
        FOR EACH ROW EXECUTE FUNCTION reject_immediate_refund_ack();`);
    const http = refundHttp();
    const first = await http.post();
    expect(first.status).toBe(200);
    const committed = await operatorSnapshot(database);
    expect(committed.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
    expect(committed.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(2);
    expect(committed.audits).toHaveLength(1);
    expect(committed.messages).toHaveLength(1);
    expect(committed.retry).toHaveLength(1);
    expect(committed.retry[0]).toMatchObject({ status: 'pending' });
    expect(committed.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 0, status: 'succeeded' });
    expect(first.body.data).toMatchObject({ paymentProcessingQueued: true, paymentProcessingStatus: 'queued' });
    await database.query('DROP TRIGGER reject_immediate_refund_ack ON gateway_retry_queue');
    await database.query("UPDATE gateway_retry_queue SET next_retry_at=NOW()-INTERVAL '1 second'");
    expect(await processRetries()).toEqual({ attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0 });
    const repaired = await operatorSnapshot(database);
    expect(repaired.wallets).toEqual(committed.wallets);
    expect(repaired.ledger).toEqual(committed.ledger);
    expect(repaired.audits).toEqual(committed.audits);
    expect(repaired.messages).toEqual(committed.messages);
    expect(repaired.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(repaired.retry[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect((await http.post()).body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
    expect(await operatorSnapshot(database)).toEqual(repaired);
  });
}, 30000);
