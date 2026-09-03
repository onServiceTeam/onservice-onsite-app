const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import {
  scheduleCommissionRate,
  SCHEDULE_CONFIRMATION,
} from '../src/services/commission-control.service';

it('Bug OPS-237 — scheduling a tier rate records the immutable version and admin decision atomically', async () => {
  const now = new Date('2026-09-01T10:00:00.000Z');
  const effectiveFrom = new Date('2026-09-01T11:00:00.000Z');
  const rateId = '00000000-0000-4000-8000-000000000237';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  queryMock.mockImplementation(async (sqlValue: unknown, paramsValue?: unknown[]) => {
    const sql = String(sqlValue);
    const params = paramsValue ?? [];
    calls.push({ sql, params });
    if (sql.includes('clock_timestamp() AS now')) return { rows: [{ now }], rowCount: 1 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('COUNT(*)::text AS total') && sql.includes('FROM providers')) {
      return { rows: [{ total: '12', approved: '9' }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) return { rows: [{ count: '3' }], rowCount: 1 };
    if (sql.includes('FROM booking_financial_terms_current ft')) {
      return { rows: [{ count: '42' }], rowCount: 1 };
    }
    if (sql.includes('SELECT crv.rate_basis_points')) return { rows: [{ rate_basis_points: 1500 }], rowCount: 1 };
    if (sql.includes('INSERT INTO commission_rate_versions')) return { rows: [{ id: rateId }], rowCount: 1 };
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    if (sql.includes('SELECT crv.*')) {
      return {
        rows: [{
          id: rateId,
          scope_type: 'tier',
          tier: 'new',
          provider_id: null,
          provider_name: null,
          provider_tier: null,
          service_category_id: null,
          category_name: null,
          service_subcategory_id: null,
          subcategory_name: null,
          rate_basis_points: 1400,
          effective_from: effectiveFrom,
          reason: 'Reviewing a prospective rate for new providers.',
          source: 'admin_schedule',
          source_metadata: {},
          created_by: actorId,
          created_by_name: 'Operations Owner',
          approved_by: actorId,
          approved_by_name: 'Operations Owner',
          created_at: now,
          cancellation_id: null,
          cancellation_reason: null,
          cancelled_by: null,
          cancelled_by_name: null,
          cancelled_at: null,
          snapshot_usage_count: '0',
          lifecycle_status: 'scheduled',
        }],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({
    query: queryMock,
  }));

  const result = await scheduleCommissionRate({
    scopeType: 'tier',
    tier: 'new',
    rateBasisPoints: 1400,
    effectiveFrom: effectiveFrom.toISOString(),
    reason: 'Reviewing a prospective rate for new providers.',
    confirmation: SCHEDULE_CONFIRMATION,
  }, actorId);

  expect(result.rate.id).toBe(rateId);
  expect(result.impact).toMatchObject({
    eligibleProviderCount: 12,
    approvedProviderCount: 9,
    currentlyAssignedPendingBookingCount: 3,
    existingSnapshotCount: 42,
  });
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(calls.some((call) => call.sql.includes('INSERT INTO commission_rate_versions'))).toBe(true);
  const auditCall = calls.find((call) => call.sql.includes('INSERT INTO admin_actions'));
  expect(auditCall?.params).toEqual(expect.arrayContaining([
    actorId,
    'config',
    rateId,
  ]));
});
