// MED-N51 / MED-N67 / MED-N115 / MED-N117 fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVICE_AREA = readFileSync(
  resolve(__dirname, '../src/services/service-area.service.ts'),
  'utf8',
);
const CATALOG = readFileSync(
  resolve(__dirname, '../src/services/catalog.service.ts'),
  'utf8',
);
const RECURRING = readFileSync(
  resolve(__dirname, '../src/services/recurring.service.ts'),
  'utf8',
);
const INVOICE = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);

describe('MED-N51 — waitlist ON CONFLICT now includes province', () => {
  it('MED-N51 — joinWaitlist source uses ON CONFLICT (phone, city, province)', () => {
    expect(SERVICE_AREA).toMatch(/ON CONFLICT \(phone, city, province\) DO UPDATE/);
    // Old key must NOT remain.
    expect(SERVICE_AREA).not.toMatch(/ON CONFLICT \(phone, city\) DO UPDATE/);
  });
});

describe('MED-N67 — saveBookingAddons dead export removed', () => {
  it('MED-N67 — function declaration is gone', () => {
    expect(CATALOG).not.toMatch(/export async function saveBookingAddons\(/);
  });

  it('MED-N67 — replacement comment is in place documenting why', () => {
    expect(CATALOG).toMatch(/MED-N67 fix/);
    expect(CATALOG).toMatch(/saveBookingAddons\(\) was a dead export/);
  });
});

describe('MED-N115 — recurring processRecurringBookings filters anonymized users', () => {
  it('MED-N115 — SELECT joins users and requires is_active', () => {
    expect(RECURRING).toMatch(/JOIN users u ON u\.id = rb\.customer_id/);
    expect(RECURRING).toMatch(/u\.is_active = TRUE/);
  });
});

describe('MED-N117 — invoice generateMonthlyInvoices wraps both bulk inserts in one trx', () => {
  it('MED-N117 — both INSERTs run via client.query inside db.transaction', () => {
    // Anchor on the MED-N117 fix comment.
    const anchor = INVOICE.indexOf('MED-N117 fix');
    expect(anchor).toBeGreaterThan(0);
    const block = INVOICE.slice(anchor, anchor + 5000);
    expect(block).toMatch(/db\.transaction\(async \(client\)/);
    expect(block).toMatch(/client\.query[\s\S]*?INSERT INTO business_invoices/);
    expect(block).toMatch(/client\.query[\s\S]*?INSERT INTO business_invoice_items/);
  });

  it('MED-N117 — items INSERT no longer runs as a separate db.query call', () => {
    // The old "// Query 3: bulk INSERT business_invoice_items via UNNEST." line
    // should be gone; the items insert now lives inside the trx.
    expect(INVOICE).not.toMatch(/Query 3: bulk INSERT business_invoice_items/);
    // No bare db.query call inserting business_invoice_items should remain.
    expect(INVOICE).not.toMatch(/db\.query\([\s\S]{0,80}INSERT INTO business_invoice_items/);
  });
});
