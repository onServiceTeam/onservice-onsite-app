const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { exportAuditLogCsv, exportAuditLogCsvStream } from '../src/services/compliance.service';

function exportRow(id: string, action: string, entityType: string) {
  return {
    id,
    source: action.includes('.') ? 'audit_log' : 'admin_actions',
    created_at: new Date('2026-09-03T08:00:00.000Z'),
    user_email: 'operator@example.com',
    user_role: 'super_admin',
    action,
    entity_type: entityType,
    entity_id: id,
    ip_address: null,
    reason: null,
    old_values: null,
    new_values: { reference: id },
  };
}

it('Bug OPS-405 — audit CSV paths enforce the same privacy boundary as the on-screen timeline', async () => {
  const operational = exportRow('booking-visible', 'booking_reassigned', 'booking');
  const privacyRows = [
    exportRow('privacy-dsr-event', 'dsr.status_changed', 'data_subject_request'),
    exportRow('privacy-dsr-action', 'dsr_escalated_to_npc', 'dsr_request'),
    exportRow('privacy-consent-version', 'consent_version_published', 'consent_version'),
    exportRow('privacy-breach', 'breach_npc_notified', 'breach'),
    exportRow('privacy-consent-search', 'consent_search', 'user'),
  ];
  const allRows = [operational, ...privacyRows];

  dbQueryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    const hasPrivacyBoundary = sql.includes("combined.entity_type IN ('dsr_request', 'data_subject_request'");
    const visibleRows = hasPrivacyBoundary ? [operational] : allRows;
    return { rows: visibleRows, rowCount: visibleRows.length };
  });

  const adminCsv = await exportAuditLogCsv({ viewerRole: 'admin' });
  expect(adminCsv).toContain('booking-visible');
  expect(adminCsv).not.toContain('privacy-');

  const superAdminCsv = await exportAuditLogCsv({ viewerRole: 'super_admin' });
  expect(superAdminCsv).toContain('booking-visible');
  for (const privacyRow of privacyRows) expect(superAdminCsv).toContain(privacyRow.id);

  const streamedAdminChunks: string[] = [];
  for await (const chunk of exportAuditLogCsvStream({ viewerRole: 'admin', batchSize: 100 })) {
    streamedAdminChunks.push(chunk);
  }
  const streamedAdminCsv = streamedAdminChunks.join('');
  expect(streamedAdminCsv).toContain('booking-visible');
  expect(streamedAdminCsv).not.toContain('privacy-');
});
