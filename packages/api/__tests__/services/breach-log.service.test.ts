// Phase 14 Dispatch 08 — Bug 1366. breach-log.service tests.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../../src/services/breach-log.service';
import {
  resetDbMock,
  setTopQueryImpl,
  setTxQueryImpl,
  makeRouter,
  getTxCalls,
} from '../helpers/d06-tx-mock';

const BREACH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(resetDbMock);

describe('Bug 1366 — createBreach', () => {
  it('logs a breach + writes audit row inside one transaction', async () => {
    // BUG-PHASE78-01 test maintenance — pre-fix hardcoded
    // '2026-04-30T08:00:00Z' which became >72h in the past on
    // 2026-05-04+, so enrichSla computed sla72hRemainingHours=0 and
    // the assertion `> 0` failed. Use `new Date()` so the test stays
    // valid as wall-clock time advances.
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO breach_log/, rows: [{
        id: BREACH_ID,
        type: 'unauthorized_access',
        scope: 'Test breach',
        affected_user_count: 100,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: null,
        npc_reference: null,
        status: 'investigating',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.createBreach({
      type: 'unauthorized_access',
      scope: 'Unauthorized DB read of customer table',
      affectedUserCount: 100,
      occurredAt: now.toISOString(),
      discoveredAt: now.toISOString(),
      reportedBy: ADMIN_ID,
    });

    expect(result.id).toBe(BREACH_ID);
    expect(result.status).toBe('investigating');
    // SLA tracking: just-discovered breach has ~72h remaining.
    expect(result.sla72hRemainingHours).toBeGreaterThan(0);
    expect(result.sla72hExpired).toBe(false);

    const audit = getTxCalls().find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain("'breach_logged'");
  });

  it('rejects discoveredAt earlier than occurredAt', async () => {
    await expect(
      svc.createBreach({
        type: 'data_loss',
        scope: 'Test',
        occurredAt: '2026-04-30T10:00:00Z',
        discoveredAt: '2026-04-30T08:00:00Z',
        reportedBy: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects scope < 10 chars', async () => {
    await expect(
      svc.createBreach({
        type: 'data_loss',
        scope: 'short',
        occurredAt: '2026-04-30T08:00:00Z',
        discoveredAt: '2026-04-30T09:00:00Z',
        reportedBy: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid type', async () => {
    await expect(
      svc.createBreach({
        type: 'bogus' as svc.BreachType,
        scope: 'Test scope long enough',
        occurredAt: '2026-04-30T08:00:00Z',
        discoveredAt: '2026-04-30T09:00:00Z',
        reportedBy: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('Bug 1366 — markNpcNotified', () => {
  it('rejects malformed NPC reference', async () => {
    await expect(
      svc.markNpcNotified({
        breachId: BREACH_ID,
        npcReference: 'INVALID-FORMAT',
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts valid NPC-YYYY-XXXXXX reference', async () => {
    const now = new Date('2026-04-30T08:00:00Z');
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM breach_log WHERE id = \$1 FOR UPDATE/, rows: [{
        id: BREACH_ID,
        type: 'unauthorized_access',
        scope: 'X',
        affected_user_count: null,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: null,
        npc_reference: null,
        status: 'investigating',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE breach_log/, rows: [{
        id: BREACH_ID,
        type: 'unauthorized_access',
        scope: 'X',
        affected_user_count: null,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: now,
        npc_reference: 'NPC-2026-A1B2C3',
        status: 'reported',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.markNpcNotified({
      breachId: BREACH_ID,
      npcReference: 'NPC-2026-A1B2C3',
      adminUserId: ADMIN_ID,
    });
    expect(result.npcReference).toBe('NPC-2026-A1B2C3');
    expect(result.status).toBe('reported');
  });

  it('rejects 409 when breach already notified', async () => {
    const now = new Date('2026-04-30T08:00:00Z');
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM breach_log WHERE id = \$1 FOR UPDATE/, rows: [{
        id: BREACH_ID,
        type: 'unauthorized_access',
        scope: 'X',
        affected_user_count: null,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: now,  // already notified
        npc_reference: 'NPC-2026-OLDREF',
        status: 'reported',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
    ]));

    await expect(
      svc.markNpcNotified({
        breachId: BREACH_ID,
        npcReference: 'NPC-2026-NEWREF',
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Bug 1366 — listBreaches enriches with sla72h_expired + sla72h_remaining_hours', () => {
  it('marks sla72h_expired when discovered > 72h ago and not notified', async () => {
    const longAgo = new Date(Date.now() - 80 * 3_600_000);
    setTopQueryImpl(makeRouter([
      { match: /SELECT \* FROM breach_log/, rows: [{
        id: BREACH_ID,
        type: 'data_loss',
        scope: 'X',
        affected_user_count: null,
        occurred_at: longAgo,
        discovered_at: longAgo,
        npc_notified_at: null,
        npc_reference: null,
        status: 'investigating',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: longAgo,
        updated_at: longAgo,
      }], rowCount: 1 },
    ]));

    const result = await svc.listBreaches();
    expect(result[0]!.sla72hExpired).toBe(true);
    expect(result[0]!.sla72hRemainingHours).toBe(0);
  });

  it('shows remaining hours for breaches within window', async () => {
    const recent = new Date(Date.now() - 10 * 3_600_000);
    setTopQueryImpl(makeRouter([
      { match: /SELECT \* FROM breach_log/, rows: [{
        id: BREACH_ID,
        type: 'data_loss',
        scope: 'X',
        affected_user_count: null,
        occurred_at: recent,
        discovered_at: recent,
        npc_notified_at: null,
        npc_reference: null,
        status: 'investigating',
        reported_by: ADMIN_ID,
        remediation_summary: null,
        created_at: recent,
        updated_at: recent,
      }], rowCount: 1 },
    ]));

    const result = await svc.listBreaches();
    expect(result[0]!.sla72hExpired).toBe(false);
    expect(result[0]!.sla72hRemainingHours).toBeGreaterThan(60);
    expect(result[0]!.sla72hRemainingHours).toBeLessThanOrEqual(72);
  });
});
