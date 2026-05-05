// BUG-PHASE186-01 — invoice service_date used UTC-anchored date,
// off-by-one for early-Manila-morning bookings. Same pattern as
// Phase 117/119/120/185.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);

describe('BUG-PHASE186-01 — invoice service_date uses Manila TZ', () => {
  it('formats scheduledAt in Asia/Manila for the service_date column', () => {
    expect(SOURCE).toMatch(
      /tItemServiceDates\.push\([\s\S]+?Intl\.DateTimeFormat\('en-CA',[\s\S]+?'Asia\/Manila'[\s\S]+?\)\.format\(scheduledAt\)/,
    );
  });

  it('PHASE186-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE186-01 fix/);
  });
});
