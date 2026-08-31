// MED-N42 fix verified.
//
// MED-N42: compliance.recordConsent's revoke UPDATE + insert
// were two separate db.query calls. If UPDATE succeeded but
// INSERT failed, prior consent rows were marked revoked but the
// new revocation event was never recorded. NPC RA 10173 §5(a)
// requires a verifiable consent trail — broken. Now wrapped in
// db.transaction.
//
// MED-N79's single-format NPC-reference assumption was later found to be
// incorrect and is superseded by the executed UX-811/UX-812 tests.
//
// MED-N81's direct email-update behavior was later removed by Bug UX-654.
// Email ownership verification does not exist yet, so /auth/me now rejects
// that field rather than trying only to make an unsafe update unique.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPLIANCE = readFileSync(
  resolve(__dirname, '../src/services/compliance.service.ts'),
  'utf8',
);

describe('MED-N42 — compliance.recordConsent revoke + insert atomic', () => {
  it('wraps both writes in db.transaction', () => {
    expect(COMPLIANCE).toMatch(/MED-N42 fix[\s\S]*?return db\.transaction\(async \(client\) => \{/);
  });

  it('revoke UPDATE uses client.query (same trx)', () => {
    expect(COMPLIANCE).toMatch(/if \(!input\.granted\) \{[\s\S]{0,500}await client\.query\([\s\S]*?UPDATE consent_records/);
  });

  it('INSERT uses client.query (same trx)', () => {
    expect(COMPLIANCE).toMatch(/await client\.query<ConsentRow>\([\s\S]*?INSERT INTO consent_records/);
  });

  it('no top-level db.query path remains in recordConsent', () => {
    // Anchor on the function header + the unique transaction-close
    // shape `return mapConsent(row);\n  });\n}` (3-level indent).
    const block = COMPLIANCE.match(/export async function recordConsent[\s\S]*?return mapConsent\(row\);\s*\}\);\s*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/await db\.query/);
  });
});
