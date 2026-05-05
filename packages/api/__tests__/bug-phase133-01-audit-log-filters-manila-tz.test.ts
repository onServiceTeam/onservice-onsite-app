// BUG-PHASE133-01 — audit-log filters had the same UTC-vs-Manila +
// 16-hour-blind-spot bug as the marketing filters fixed in Phase 132.
// Two endpoints share the same admin-page filter (AuditLogPage.tsx
// sends YYYY-MM-DD `from`/`to` query params to both):
//
//   GET /api/v1/admin/audit-log               (admin.routes.ts inline SQL)
//   GET /api/v1/admin/audit-log/export.csv    (compliance.service buildExportWhere)
//
// Pre-fix both passed YYYY-MM-DD strings directly to a timestamptz
// comparison, so Pg interpreted the literal as UTC midnight. With
// `from='2026-05-01' / to='2026-05-31'`, an admin doing a compliance
// audit was missing 00:00-08:00 Manila on May 1 and 08:00-23:59 Manila
// on May 31 (16 hours of audit entries excluded from the to-side
// every query).
//
// Same Manila TZ correction shape as Phases 109/113/117/119/122/123/
// 124/129/130/132 — Manila is the canonical TZ for the launch market.
//
// Test strategy: source-content regression on both surfaces. The
// behavioral correctness (admin sees the right entries at the
// boundary) requires a real Pg fixture not in scope; the SQL-fragment
// shape is the single source of truth for the bound semantics.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ADMIN_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/admin.routes.ts'),
  'utf8',
);
const COMPLIANCE_SVC = readFileSync(
  resolve(__dirname, '../src/services/compliance.service.ts'),
  'utf8',
);

describe('BUG-PHASE133-01 — audit-log filters Manila-anchored', () => {
  // The route SQL is built from JS template literals like
  //   `combined.created_at >= ($${paramIdx++}::date AT TIME ZONE 'Asia/Manila')`
  // In the source-code text the literal `$$` appears (the first $ is
  // emitted, the second is interpolation). Regexes below match the
  // SOURCE form, not the runtime SQL.

  describe('admin.routes.ts /audit-log endpoint', () => {
    it('emits Manila-anchored from-bound', () => {
      expect(ADMIN_ROUTES).toMatch(
        /combined\.created_at >= \(\$\$\{paramIdx\+\+\}::date AT TIME ZONE 'Asia\/Manila'\)/,
      );
    });

    it('emits Manila-anchored half-open to-bound (no `<=`)', () => {
      expect(ADMIN_ROUTES).toMatch(
        /combined\.created_at < \(\(\$\$\{paramIdx\+\+\}::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
      );
    });

    it('regression guard: pre-fix `combined.created_at <= $N` shape is gone', () => {
      expect(ADMIN_ROUTES).not.toMatch(/combined\.created_at <= \$\$\{paramIdx/);
    });
  });

  describe('compliance.service.ts buildExportWhere (CSV export)', () => {
    it('emits Manila-anchored from-bound', () => {
      expect(COMPLIANCE_SVC).toMatch(
        /al\.created_at >= \(\$\$\{params\.length\}::date AT TIME ZONE 'Asia\/Manila'\)/,
      );
    });

    it('emits Manila-anchored half-open to-bound', () => {
      expect(COMPLIANCE_SVC).toMatch(
        /al\.created_at < \(\(\$\$\{params\.length\}::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
      );
    });

    it('regression guard: pre-fix `al.created_at <= $N` shape is gone', () => {
      expect(COMPLIANCE_SVC).not.toMatch(/al\.created_at <= \$\$\{params\.length\}/);
    });
  });
});
