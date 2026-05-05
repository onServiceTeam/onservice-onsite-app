// BUG-PHASE114-01 — two more UTC leakage points on the API side
// after Phase 113 fixed the recurring cron.
//
// 1. packages/api/src/routes/compliance-admin.routes.ts — the
//    audit-log CSV export's Content-Disposition filename used UTC:
//      const dateStr = new Date().toISOString().slice(0, 10);
//      ...filename="audit-log-${dateStr}.csv"
//    A compliance officer running the export at 00:30 Manila Thursday
//    received a file named with the Wednesday UTC date, so a Downloads
//    search by Thursday's date came up empty. This pairs with Phase
//    112's browser-side fix on the admin CompliancePage CSV download
//    button — both filename paths needed to land on the Manila day so
//    the server-served and the browser-fallback file names match.
//
// 2. packages/api/src/services/invoice.service.ts — checkOverdueInvoices
//    cron compared UTC `today` to due_date (Manila YYYY-MM-DD). For
//    invoices due "today Manila" the overdue-notification fired up to
//    8 hours late (UTC midnight is 08:00 Manila; between 16:00–23:59
//    UTC, Manila has rolled over but UTC hasn't). Same pattern as
//    Phase 113's recurring cron fix.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPLIANCE_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/compliance-admin.routes.ts'),
  'utf8',
);
const INVOICE = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);

describe('BUG-PHASE114-01 — API CSV filename + invoice-overdue cron use Manila day', () => {
  describe('compliance-admin.routes.ts CSV export', () => {
    it('BUG-PHASE114-01 — dateStr uses toLocaleDateString with Asia/Manila', () => {
      expect(COMPLIANCE_ROUTES).toMatch(
        /const dateStr = new Date\(\)\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\);/,
      );
    });

    it('BUG-PHASE114-01 — pre-fix toISOString().slice(0, 10) for the dateStr is gone', () => {
      expect(COMPLIANCE_ROUTES).not.toMatch(/const dateStr = new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/);
    });

    it('BUG-PHASE114-01 — Content-Disposition filename still wires through dateStr (regression guard)', () => {
      expect(COMPLIANCE_ROUTES).toMatch(/audit-log-\$\{dateStr\}\.csv/);
    });
  });

  describe('invoice.service.ts checkOverdueInvoices', () => {
    it('BUG-PHASE114-01 — `today` uses toLocaleDateString with Asia/Manila', () => {
      // Match the line inside checkOverdueInvoices.
      const overdueBody = INVOICE.match(/export async function checkOverdueInvoices[\s\S]{0,1500}/);
      expect(overdueBody).not.toBeNull();
      expect(overdueBody?.[0]).toMatch(
        /const today = new Date\(\)\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\);/,
      );
    });

    it('BUG-PHASE114-01 — pre-fix `new Date().toISOString().split("T")[0]!` `today` line is gone from checkOverdueInvoices', () => {
      const overdueBody = INVOICE.match(/export async function checkOverdueInvoices[\s\S]{0,1500}/);
      expect(overdueBody).not.toBeNull();
      expect(overdueBody?.[0]).not.toMatch(
        /const today = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]!;/,
      );
    });

    it('BUG-PHASE114-01 — UPDATE due_date < $1 still wired (regression guard for the actual overdue check)', () => {
      expect(INVOICE).toMatch(/SET status = 'overdue'/);
      expect(INVOICE).toMatch(/WHERE status = 'sent' AND due_date < \$1/);
    });
  });
});
