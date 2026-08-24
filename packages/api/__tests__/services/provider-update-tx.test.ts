// Phase 14 Dispatch 06 — Bug 79 + Bug 80 + Bug 82.
// updateProviderProfile, deleteProviderNote, createProviderNote must each
// do their mutation + admin_actions audit inside ONE db.transaction.
// Pre-D06: top-level db.query writes with NO audit. Now: transactional
// composition + audit inside the same transaction. Bug 80 also converts
// hard DELETE to soft delete (deleted_at column from migration 076).

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import {
  updateProviderProfile,
  createProviderNote,
  deleteProviderNote,
} from '../../src/services/provider-admin.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const NOTE_ID = '33333333-3333-3333-3333-333333333333';

beforeEach(resetDbMock);

describe('Bug 79 — updateProviderProfile transactional + audit', () => {
  it('writes profile UPDATE + admin_actions audit inside one transaction', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT business_name, description, service_radius_km/, rows: [{ business_name: 'OldCo', description: 'old desc', service_radius_km: 30 }], rowCount: 1 },
      { match: /UPDATE providers/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-prof' }], rowCount: 1 },
    ]));

    await updateProviderProfile(PROVIDER_ID, { businessName: 'NewCo' }, ADMIN_ID);

    expect(getTransactionInvocations()).toBe(1);
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE providers/.test(c.sql))).toBeDefined();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'provider_profile_updated'");
    const details = JSON.parse(auditCall!.params[2] as string);
    expect(details.patch.businessName).toBe('NewCo');
    expect(details.previous.businessName).toBe('OldCo');
  });

  it('rolls back when admin_actions INSERT throws (Bug 79 audit-failure)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT business_name, description, service_radius_km/, rows: [{ business_name: 'OldCo', description: null, service_radius_km: 30 }], rowCount: 1 },
      { match: /UPDATE providers/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      updateProviderProfile(PROVIDER_ID, { businessName: 'NewCo' }, ADMIN_ID),
    ).rejects.toThrow(/simulated audit failure/);

    // No top-level UPDATE leaked outside the transaction.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /UPDATE providers/.test(c.sql))).toBeUndefined();
  });

  it('rejects radius above the live maximum and audits a valid radius UPDATE', async () => {
    await expect(
      updateProviderProfile(PROVIDER_ID, { serviceRadiusKm: 9999 }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);

    setTxQueryImpl(makeRouter([
      { match: /SELECT business_name, description, service_radius_km/, rows: [{ business_name: null, description: null, service_radius_km: 50 }], rowCount: 1 },
      { match: /UPDATE providers/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-prof' }], rowCount: 1 },
    ]));

    await updateProviderProfile(PROVIDER_ID, { serviceRadiusKm: 50 }, ADMIN_ID);

    const txCalls = getTxCalls();
    const updateCall = txCalls.find((c) => /UPDATE providers/.test(c.sql));
    expect(updateCall!.params[0]).toBe(50);
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    const details = JSON.parse(auditCall!.params[2] as string);
    expect(details.patch.serviceRadiusKm).toBe(50);
  });

  it('no-op early-return when patch is empty (no transaction opened)', async () => {
    await updateProviderProfile(PROVIDER_ID, {}, ADMIN_ID);
    expect(getTransactionInvocations()).toBe(0);
  });

  it('404 when provider missing', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT business_name, description, service_radius_km/, rows: [], rowCount: 0 },
    ]));
    await expect(
      updateProviderProfile(PROVIDER_ID, { businessName: 'X' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('Bug 82 — createProviderNote transactional + audit', () => {
  it('writes note INSERT + admin_actions audit inside one transaction', async () => {
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO provider_admin_notes/, rows: [{
        id: NOTE_ID,
        provider_id: PROVIDER_ID,
        author_id: ADMIN_ID,
        category: 'quality',
        body: 'note body',
        pinned: false,
        created_at: new Date('2024-02-02T00:00:00Z'),
        updated_at: new Date('2024-02-02T00:00:00Z'),
      }], rowCount: 1 },
      { match: /SELECT \(first_name/, rows: [{ author_name: 'Admin Joe' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-note-create' }], rowCount: 1 },
    ]));

    const out = await createProviderNote(PROVIDER_ID, ADMIN_ID, 'quality', 'note body', false);

    expect(getTransactionInvocations()).toBe(1);
    expect(out.id).toBe(NOTE_ID);
    expect(out.authorName).toBe('Admin Joe');

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'provider_note_added'");
    expect(auditCall!.sql).toContain("'provider_note'");
    expect(auditCall!.params[1]).toBe(NOTE_ID);
  });

  it('rolls back when admin_actions audit insert throws (note INSERT also rolls back)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO provider_admin_notes/, rows: [{
        id: NOTE_ID,
        provider_id: PROVIDER_ID,
        author_id: ADMIN_ID,
        category: 'general',
        body: 'note body',
        pinned: false,
        created_at: new Date(),
        updated_at: new Date(),
      }], rowCount: 1 },
      { match: /SELECT \(first_name/, rows: [{ author_name: 'Admin Joe' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      createProviderNote(PROVIDER_ID, ADMIN_ID, 'general', 'note body', false),
    ).rejects.toThrow(/simulated audit failure/);

    // The note INSERT and audit attempt both happened on client.query
    // (not top-level db.query). Runtime ROLLBACK rewinds both.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO provider_admin_notes/.test(c.sql))).toBeUndefined();
  });

  it('rejects empty body', async () => {
    await expect(
      createProviderNote(PROVIDER_ID, ADMIN_ID, 'general', '   ', false),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });
});

describe('Bug 80 — deleteProviderNote soft delete transactional + audit', () => {
  it('UPDATEs deleted_at + writes admin_actions audit inside one transaction (no hard DELETE)', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT author_id, provider_id, deleted_at FROM provider_admin_notes/, rows: [{ author_id: ADMIN_ID, provider_id: PROVIDER_ID, deleted_at: null }], rowCount: 1 },
      { match: /UPDATE provider_admin_notes\s+SET deleted_at = NOW\(\)/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-del' }], rowCount: 1 },
    ]));

    await deleteProviderNote(NOTE_ID, ADMIN_ID, false, 'no longer relevant');

    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE provider_admin_notes/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /^DELETE FROM/.test(c.sql))).toBeUndefined();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'provider_note_deleted'");
    expect(auditCall!.params[3]).toBe('no longer relevant');
  });

  it('rejects already-deleted note with 409', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT author_id, provider_id, deleted_at FROM provider_admin_notes/, rows: [{ author_id: ADMIN_ID, provider_id: PROVIDER_ID, deleted_at: new Date() }], rowCount: 1 },
    ]));
    await expect(
      deleteProviderNote(NOTE_ID, ADMIN_ID, false),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects non-author non-super-admin (403)', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT author_id, provider_id, deleted_at FROM provider_admin_notes/, rows: [{ author_id: 'someone-else', provider_id: PROVIDER_ID, deleted_at: null }], rowCount: 1 },
    ]));
    await expect(
      deleteProviderNote(NOTE_ID, ADMIN_ID, false),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows super-admin override', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT author_id, provider_id, deleted_at FROM provider_admin_notes/, rows: [{ author_id: 'someone-else', provider_id: PROVIDER_ID, deleted_at: null }], rowCount: 1 },
      { match: /UPDATE provider_admin_notes/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-del-sa' }], rowCount: 1 },
    ]));
    await deleteProviderNote(NOTE_ID, ADMIN_ID, true, 'super-admin override');
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE provider_admin_notes/.test(c.sql))).toBeDefined();
  });

  it('rolls back when admin_actions INSERT throws (Bug 80 audit-failure)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT author_id, provider_id, deleted_at FROM provider_admin_notes/, rows: [{ author_id: ADMIN_ID, provider_id: PROVIDER_ID, deleted_at: null }], rowCount: 1 },
      { match: /UPDATE provider_admin_notes/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      deleteProviderNote(NOTE_ID, ADMIN_ID, false, 'reason'),
    ).rejects.toThrow(/simulated audit failure/);
  });
});
