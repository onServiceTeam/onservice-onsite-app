const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { exportAuditLogCsv } from '../src/services/compliance.service';

it('Bug OPS-425 - an exact audit event CSV uses the same entry and source filters as the screen', async () => {
  const entryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: entryId,
    source: 'audit_log',
    created_at: new Date('2026-09-03T08:00:00.000Z'),
    user_email: null,
    user_role: null,
    action: 'booking.status_changed',
    entity_type: 'booking',
    entity_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ip_address: '203.0.113.8',
    reason: null,
    old_values: null,
    new_values: { status: 'in_progress' },
  }], rowCount: 1 });

  const csv = await exportAuditLogCsv({
    entryId,
    source: 'audit_log',
    viewerRole: 'super_admin',
  });

  expect(csv).toContain(entryId);
  const sql = String(dbQueryMock.mock.calls[0]?.[0]);
  expect(sql).toContain('combined.id = $1');
  expect(sql).toContain('combined.source = $2');
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([entryId, 'audit_log']);
});
