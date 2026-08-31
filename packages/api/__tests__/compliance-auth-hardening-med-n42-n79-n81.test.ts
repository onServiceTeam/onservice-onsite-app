// MED-N42 + MED-N79 fixes verified.
//
// MED-N42: compliance.recordConsent's revoke UPDATE + insert
// were two separate db.query calls. If UPDATE succeeded but
// INSERT failed, prior consent rows were marked revoked but the
// new revocation event was never recorded. NPC RA 10173 §5(a)
// requires a verifiable consent trail — broken. Now wrapped in
// db.transaction.
//
// MED-N79: breach-log NPC reference regex used `[A-Z0-9]{6,}`
// (unbounded suffix). NPC docs specify exactly 6 alphanumeric
// after the year. Tightened to {6}.
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
const BREACH = readFileSync(
  resolve(__dirname, '../src/services/breach-log.service.ts'),
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
describe('MED-N79 — breach-log NPC reference regex tightened to exactly 6 alphanumerics', () => {
  it('regex uses {6} not {6,}', () => {
    expect(BREACH).toMatch(/NPC_REF_REGEX = \/\^NPC-\\d\{4\}-\[A-Z0-9\]\{6\}\$\//);
    expect(BREACH).not.toMatch(/NPC_REF_REGEX = \/\^NPC-\\d\{4\}-\[A-Z0-9\]\{6,\}\$\//);
  });

  it('comment cites NPC documentation source', () => {
    expect(BREACH).toMatch(/MED-N79 fix/);
    expect(BREACH).toMatch(/privacy\.gov\.ph/);
  });
});

describe('MED-N79 — regex behavioral smoke', () => {
  const NPC_REF_REGEX = /^NPC-\d{4}-[A-Z0-9]{6}$/;

  it('accepts canonical reference', () => {
    expect(NPC_REF_REGEX.test('NPC-2026-ABC123')).toBe(true);
  });

  it('rejects 7-char suffix', () => {
    expect(NPC_REF_REGEX.test('NPC-2026-ABC1234')).toBe(false);
  });

  it('rejects 5-char suffix', () => {
    expect(NPC_REF_REGEX.test('NPC-2026-ABC12')).toBe(false);
  });

  it('rejects pasted-URL fragment', () => {
    expect(NPC_REF_REGEX.test('NPC-2026-ABC123XYZ_garbage')).toBe(false);
  });

  it('rejects lowercase suffix', () => {
    expect(NPC_REF_REGEX.test('NPC-2026-abc123')).toBe(false);
  });
});
