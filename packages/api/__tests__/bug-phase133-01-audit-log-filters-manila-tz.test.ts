import { describe, expect, it } from '@jest/globals';
import { parseAuditTimelineListQuery } from '../src/validators/admin-audit-log.validators';

describe('BUG-PHASE133-01 — audit-log filters preserve Manila calendar dates', () => {
  it('BUG-PHASE133-01 — accepts and preserves a complete Manila date range', () => {
    const parsed = parseAuditTimelineListQuery({
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(parsed.from).toBe('2026-05-01');
    expect(parsed.to).toBe('2026-05-31');
  });
});
