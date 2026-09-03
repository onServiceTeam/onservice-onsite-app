import { describe, expect, it } from '@jest/globals';
import {
  parseAuditTimelineExportQuery,
  parseAuditTimelineListQuery,
} from '../src/validators/admin-audit-log.validators';

describe('admin audit timeline query validation', () => {
  it('Bug UX-531 — rejects malformed pagination instead of coercing it', () => {
    expect(() => parseAuditTimelineListQuery({ page: '1x' })).toThrow(
      'page must be a positive integer',
    );
  });

  it('Bug UX-532 — rejects unsupported timeline source names', () => {
    expect(() => parseAuditTimelineExportQuery({ source: 'requests' })).toThrow(
      'source must be audit_log or admin_actions',
    );
  });

  it('Bug UX-533 — rejects impossible calendar dates', () => {
    expect(() => parseAuditTimelineListQuery({ from: '2026-02-30' })).toThrow(
      'from must be a valid YYYY-MM-DD date',
    );
  });

  it('Bug UX-534 — rejects reversed timeline date ranges', () => {
    expect(() => parseAuditTimelineListQuery({
      from: '2026-08-31',
      to: '2026-08-01',
    })).toThrow('from must be before or equal to to');
  });

  it('Bug UX-535 — rejects a partial record identifier', () => {
    expect(() => parseAuditTimelineListQuery({ entityId: 'booking-123' })).toThrow(
      'entityId must be a valid UUID',
    );
  });

  it('Bug UX-536 — rejects a partial actor identifier', () => {
    expect(() => parseAuditTimelineListQuery({ userId: 'admin-123' })).toThrow(
      'userId must be a valid UUID',
    );
  });

  it('Bug UX-540 — accepts every supported exact timeline filter', () => {
    expect(parseAuditTimelineExportQuery({
      entryId: '00000000-0000-4000-8000-000000000000',
      userId: '11111111-1111-4111-8111-111111111111',
      action: ' booking ',
      entityType: 'booking',
      entityId: '22222222-2222-4222-8222-222222222222',
      source: 'admin_actions',
      from: '2026-08-01',
      to: '2026-08-30',
      limit: '10000',
    })).toEqual({
      entryId: '00000000-0000-4000-8000-000000000000',
      userId: '11111111-1111-4111-8111-111111111111',
      action: 'booking',
      entityType: 'booking',
      entityId: '22222222-2222-4222-8222-222222222222',
      source: 'admin_actions',
      from: '2026-08-01',
      to: '2026-08-30',
      limit: 10000,
    });
  });
});
