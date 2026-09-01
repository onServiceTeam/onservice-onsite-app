const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { exportAuditLogCsvStream } from '../src/services/compliance.service';

function auditRow(index: number) {
  return {
    id: `audit-med-n45-${index}`,
    source: 'audit_log',
    created_at: new Date(`2026-09-01T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
    user_email: `operator${index}@example.test`,
    user_role: 'admin',
    action: 'booking_viewed',
    entity_type: 'booking',
    entity_id: `booking-med-n45-${index}`,
    ip_address: '203.0.113.19',
    reason: 'Support investigation',
    old_values: null,
    new_values: null,
  };
}

it('MED-N45 - audit CSV streaming emits bounded pages instead of assembling the export in memory', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: Array.from({ length: 100 }, (_, index) => auditRow(index)),
      rowCount: 100,
    })
    .mockResolvedValueOnce({ rows: [auditRow(100)], rowCount: 1 });

  const chunks: string[] = [];
  for await (const chunk of exportAuditLogCsvStream({
    viewerRole: 'admin',
    limit: 101,
    batchSize: 100,
  })) {
    chunks.push(chunk);
  }

  expect(chunks).toHaveLength(102);
  expect(chunks[0]).toMatch(/^id,source,createdAt/);
  expect(chunks[1]).toContain('audit-med-n45-0');
  expect(chunks[101]).toContain('audit-med-n45-100');
  expect(mockDbQuery).toHaveBeenCalledTimes(2);
  expect(mockDbQuery.mock.calls[0]![0]).toMatch(/LIMIT 100 OFFSET 0/);
  expect(mockDbQuery.mock.calls[1]![0]).toMatch(/LIMIT 1 OFFSET 100/);
});
