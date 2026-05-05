// BUG-PHASE120-01 — three BIR-relevant numbering / monthly-period
// surfaces used device-local YYYYMM extraction. The API container
// runs UTC, so each surface produced the wrong calendar month for
// any work that crossed the Manila/UTC midnight boundary:
//
// 1. provider-tools.service.ts receiptNumber generator
//    Pre-fix: `RCP-${receiptDate.getFullYear()}${String(receiptDate.getMonth() + 1).padStart(2, '0')}-...`
//    A receipt issued at 01:00 Manila June 1 (= 17:00 UTC May 31)
//    got numbered "RCP-202605-..." while Manila said "June 1". BIR
//    monthly filing periods anchor to Manila days; numbering
//    drift = audit-trail mismatch.
//
// 2. invoice.service.ts generateInvoiceNumber(date)
//    Pre-fix: `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-...`
//    Same shape, same bug.
//
// 3. invoice.service.ts generateMonthlyInvoices() "last month" calc
//    Pre-fix:
//      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//    For an admin running this at 00:00 Manila June 1 (= 16:00 UTC
//    May 31), server saw `getMonth() = 4` (May UTC) and computed
//    "lastMonth = April" — billing April A SECOND TIME and missing
//    May entirely. Concrete bill-the-wrong-month bug.
//
// All three fixes anchor to Manila via toLocaleDateString('en-CA',
// { timeZone: 'Asia/Manila' }) and string slice for the YYYYMM
// shape. For the "last month" calc, a UTC-midnight Date is built
// from the Manila day so getUTC* methods return the Manila
// calendar month.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROVIDER_TOOLS = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);
const INVOICE = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);

describe('BUG-PHASE120-01 — receipt + invoice + monthly-billing YYYYMM anchored to Manila', () => {
  describe('provider-tools.service receipt number', () => {
    it('BUG-PHASE120-01 — manilaDateStr extracted via Asia/Manila', () => {
      expect(PROVIDER_TOOLS).toMatch(
        /const manilaDateStr = receiptDate\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/,
      );
    });

    it('BUG-PHASE120-01 — receipt number template uses manilaDateStr slice (not getFullYear/getMonth)', () => {
      expect(PROVIDER_TOOLS).toMatch(
        /RCP-\$\{manilaDateStr\.slice\(0, 4\)\}\$\{manilaDateStr\.slice\(5, 7\)\}-\$\{bookingId\.toUpperCase\(\)\}/,
      );
    });

    it('BUG-PHASE120-01 — pre-fix `receiptDate.getFullYear()` is gone from the receipt template', () => {
      expect(PROVIDER_TOOLS).not.toMatch(
        /RCP-\$\{receiptDate\.getFullYear\(\)\}\$\{String\(receiptDate\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\)\}/,
      );
    });
  });

  describe('invoice.service generateInvoiceNumber', () => {
    it('BUG-PHASE120-01 — manilaDateStr extracted via Asia/Manila', () => {
      // Match the helper-function body, since INVOICE is a long file.
      const body = INVOICE.match(/function generateInvoiceNumber[\s\S]+?\n\}/);
      expect(body).not.toBeNull();
      expect(body?.[0]).toMatch(
        /const manilaDateStr = date\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/,
      );
    });

    it('BUG-PHASE120-01 — INV-YYYYMM-XXX template uses manilaDateStr slice', () => {
      expect(INVOICE).toMatch(/return `INV-\$\{year\}\$\{month\}-\$\{suffix\}`/);
      expect(INVOICE).toMatch(/const year = manilaDateStr\.slice\(0, 4\);/);
      expect(INVOICE).toMatch(/const month = manilaDateStr\.slice\(5, 7\);/);
    });

    it('BUG-PHASE120-01 — pre-fix `date.getFullYear()` is gone from generateInvoiceNumber', () => {
      const body = INVOICE.match(/function generateInvoiceNumber[\s\S]+?\n\}/);
      expect(body?.[0]).not.toMatch(/const year = date\.getFullYear\(\);/);
      expect(body?.[0]).not.toMatch(/const month = String\(date\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\);/);
    });
  });

  describe('invoice.service generateMonthlyInvoices last-month calc', () => {
    it('BUG-PHASE120-01 — manilaTodayStr extracted via Asia/Manila', () => {
      expect(INVOICE).toMatch(
        /const manilaTodayStr = now\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/,
      );
    });

    it('BUG-PHASE120-01 — manilaToday anchor builds UTC-midnight from Manila day, then uses Date.UTC + getUTCMonth/getUTCFullYear for last-month + period boundaries', () => {
      expect(INVOICE).toMatch(/const manilaToday = new Date\(`\$\{manilaTodayStr\}T00:00:00Z`\)/);
      expect(INVOICE).toMatch(
        /const lastMonth = new Date\(Date\.UTC\(manilaToday\.getUTCFullYear\(\), manilaToday\.getUTCMonth\(\) - 1, 1\)\)/,
      );
      expect(INVOICE).toMatch(
        /new Date\(Date\.UTC\(manilaToday\.getUTCFullYear\(\), manilaToday\.getUTCMonth\(\), 0\)\)/,
      );
    });

    it('BUG-PHASE120-01 — pre-fix device-local now.getFullYear / now.getMonth lastMonth calc is gone', () => {
      expect(INVOICE).not.toMatch(/const lastMonth = new Date\(now\.getFullYear\(\), now\.getMonth\(\) - 1, 1\);/);
      expect(INVOICE).not.toMatch(/new Date\(now\.getFullYear\(\), now\.getMonth\(\), 0\)\.toISOString\(\)/);
    });
  });
});
