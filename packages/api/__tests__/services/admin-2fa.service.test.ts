// Phase 14 Dispatch 10 — Bug 357 + 358 + 360.
// Admin 2FA backup codes — generation + single-use consumption.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../../src/services/admin-2fa.service';
import {
  resetDbMock,
  setTopQueryImpl,
  setTxQueryImpl,
  makeRouter,
  getTxCalls,
} from '../helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SUPER_ADMIN_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(resetDbMock);

describe('Bug 360 — generateBackupCodes', () => {
  it('produces 8 plaintext codes + writes 8 INSERTs + audit row', async () => {
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_backup_codes/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.generateBackupCodes(ADMIN_ID);

    expect(result.codes).toHaveLength(8);
    // Each code is 10 alphanumeric chars from the no-confusing-chars alphabet.
    for (const code of result.codes) {
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    }
    expect(new Set(result.codes).size).toBe(8); // unique codes

    // Audit verb is _generated (first-time enrollment).
    const audit = getTxCalls().find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.params[1]).toBe('admin_backup_codes_generated');
  });

  it('regeneration soft-deletes prior active codes + writes _regenerated audit', async () => {
    setTxQueryImpl(makeRouter([
      { match: /UPDATE admin_backup_codes\s+SET deleted_at = NOW/, rowCount: 8 },
      { match: /INSERT INTO admin_backup_codes/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.generateBackupCodes(ADMIN_ID, { regeneratedBy: SUPER_ADMIN_ID });

    expect(result.codes).toHaveLength(8);

    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE admin_backup_codes/.test(c.sql))).toBeDefined();
    const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit!.params[1]).toBe('admin_backup_codes_regenerated');
  });
});

describe('Bug 357 + 358 — consumeBackupCode (single-use)', () => {
  it('rejects code with wrong length', async () => {
    await expect(
      svc.consumeBackupCode(ADMIN_ID, 'TOO_SHORT'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when no active codes exist', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, code_hash FROM admin_backup_codes/, rows: [], rowCount: 0 },
    ]));
    await expect(
      svc.consumeBackupCode(ADMIN_ID, 'ABCDEFGHJK'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('full flow: generate → consume the actual code → marks used_at + audit + remaining count', async () => {
    // First generate codes.
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_backup_codes/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));
    const generated = await svc.generateBackupCodes(ADMIN_ID);

    // Capture the hashes from the INSERTs by re-running the underlying
    // hashCode function isn't possible, but we can use one of the
    // plaintext codes and stub the SELECT to return its real hash. The
    // service's own hashing logic is what we want to exercise — so let
    // the consumeBackupCode service hash the stored value identically.
    // For test purposes: fabricate an inserted-code hash using the same
    // crypto path by importing crypto here and computing it.
    const crypto = jest.requireActual('node:crypto');
    const target = generated.codes[0]!;
    const salt = '0123456789abcdef0123456789abcdef';
    const N = 16384;
    const r = 8;
    const p = 1;
    const KEYLEN = 64;
    const h = crypto.scryptSync(target, salt, KEYLEN, { N, r, p, maxmem: 256 * 1024 * 1024 }).toString('hex');
    const storedHash = `scrypt:${N}:${r}:${p}:${salt}:${h}`;

    resetDbMock();
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, code_hash FROM admin_backup_codes/, rows: [
        { id: 'code-1', code_hash: storedHash },
      ], rowCount: 1 },
      { match: /UPDATE admin_backup_codes\s+SET used_at = NOW/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
      { match: /SELECT COUNT\(\*\)::text AS count FROM admin_backup_codes/, rows: [{ count: '7' }], rowCount: 1 },
    ]));

    const result = await svc.consumeBackupCode(ADMIN_ID, target, '203.0.113.5');

    expect(result.remainingCodes).toBe(7);

    const audit = getTxCalls().find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit!.sql).toContain("'admin_backup_code_used'");
  });
});

describe('Bug 360 — countActiveBackupCodes', () => {
  it('returns count of unused undeleted codes', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT COUNT\(\*\)::text AS count FROM admin_backup_codes/, rows: [{ count: '5' }], rowCount: 1 },
    ]));
    expect(await svc.countActiveBackupCodes(ADMIN_ID)).toBe(5);
  });
});
