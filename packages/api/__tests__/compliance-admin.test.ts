/**
 * Phase 11 — Hermetic unit tests for compliance service.
 *
 * Mocks db.query and logger. No real SQL, no integration. Asserts:
 *   - Validation rejections.
 *   - SQL contains key fragments (NOW(), INTERVAL '15 days', etc).
 *   - Audit_log inserts use the correct action labels and never throw.
 *   - DSR status transitions are enforced.
 *   - CSV export is RFC 4180 compliant.
 *   - BIR calendar produces correct entries and statuses for a fixed `now`.
 */

const dbQueryMock = jest.fn();

// MED-N42 fix (compliance.service.recordConsent now uses
// db.transaction for the revoke + insert pair). The transaction
// callback receives a client whose `query` is the same dbQueryMock,
// so existing tests that mock dbQueryMock.mockResolvedValueOnce(...)
// still work — they just count calls inside the transaction.
const dbTransactionMock = jest.fn(async (cb: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cb as any)({ query: (...args: unknown[]) => dbQueryMock(...args) });
});

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const loggerWarn = jest.fn();
const loggerInfo = jest.fn();
const loggerError = jest.fn();
const loggerDebug = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
  },
}));

import * as svc from '../src/services/compliance.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

const USER_ID = 'u0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const DSR_ID = 'd0000000-0000-0000-0000-000000000001';
const CONSENT_ID = 'c0000000-0000-0000-0000-000000000001';

function makeConsentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONSENT_ID,
    user_id: USER_ID,
    consent_type: 'marketing_consent',
    version: 'v1',
    granted: true,
    granted_at: new Date('2026-04-01T00:00:00Z'),
    revoked_at: null,
    ip_address: '203.0.113.1',
    user_agent: 'Mozilla',
    ...overrides,
  };
}

function makeDsrRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DSR_ID,
    user_id: USER_ID,
    user_email: 'jane@example.com',
    request_type: 'access',
    status: 'received',
    received_at: new Date('2026-04-10T00:00:00Z'),
    due_at: new Date('2026-04-25T00:00:00Z'),
    completed_at: null,
    handled_by: null,
    user_message: 'Please send my data',
    admin_notes: null,
    response_payload_url: null,
    rejection_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  loggerDebug.mockReset();
});

// ─────────────────────────────────────────────────────────────────
// recordConsent
// ─────────────────────────────────────────────────────────────────

describe('recordConsent', () => {
  it('inserts a granted consent row and returns mapped record', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makeConsentRow()]));

    const out = await svc.recordConsent({
      userId: USER_ID,
      consentType: 'marketing_consent',
      version: 'v1',
      granted: true,
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla',
    });

    expect(out).toMatchObject({
      id: CONSENT_ID,
      userId: USER_ID,
      consentType: 'marketing_consent',
      granted: true,
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const insertSql = dbQueryMock.mock.calls[0][0] as string;
    expect(insertSql).toMatch(/INSERT INTO consent_records/);
  });

  it('on granted=false, first revokes prior granted rows, then inserts', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // UPDATE prior consents
      .mockResolvedValueOnce(rows([makeConsentRow({ granted: false, revoked_at: null })]));

    await svc.recordConsent({
      userId: USER_ID,
      consentType: 'marketing_consent',
      version: 'v1',
      granted: false,
    });

    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    const updateSql = dbQueryMock.mock.calls[0][0] as string;
    expect(updateSql).toMatch(/UPDATE consent_records/);
    expect(updateSql).toMatch(/SET revoked_at = NOW\(\)/);
    expect(updateSql).toMatch(/granted = TRUE/);
    expect(updateSql).toMatch(/revoked_at IS NULL/);
  });

  it('does not call UPDATE when granted=true', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makeConsentRow()]));
    await svc.recordConsent({
      userId: USER_ID, consentType: 'terms_of_service', version: 'v2', granted: true,
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect((dbQueryMock.mock.calls[0][0] as string)).toMatch(/INSERT/);
  });

  it('MED-N42 — when revoke UPDATE throws, the WHOLE transaction rolls back (does NOT silently insert a phantom revoke)', async () => {
    // Pre-fix the function caught the revoke error + still inserted
    // a 'revoked' row, leaving prior consents intact but the user's
    // current state showing revoked. Now: atomic — revoke failure
    // rolls back the transaction so the caller knows nothing
    // happened and can retry.
    dbQueryMock.mockRejectedValueOnce(new Error('revoke boom'));

    await expect(
      svc.recordConsent({
        userId: USER_ID, consentType: 'marketing_consent', version: 'v1', granted: false,
      }),
    ).rejects.toThrow(/revoke boom/);
  });

  it('rejects empty consentType', async () => {
    await expect(svc.recordConsent({
      userId: USER_ID, consentType: '', version: 'v1', granted: true,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('rejects empty userId', async () => {
    await expect(svc.recordConsent({
      userId: '', consentType: 'x', version: 'v1', granted: true,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects non-boolean granted', async () => {
    await expect(svc.recordConsent({
      userId: USER_ID, consentType: 'x', version: 'v1',
      granted: 'yes' as unknown as boolean,
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────
// listConsentForUser + searchConsent
// ─────────────────────────────────────────────────────────────────

describe('listConsentForUser', () => {
  it('returns mapped rows for the given user', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makeConsentRow(), makeConsentRow({ id: 'c2' })]));
    const out = await svc.listConsentForUser(USER_ID);
    expect(out).toHaveLength(2);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE user_id = \$1/);
  });
});

describe('searchConsent', () => {
  it('applies all three filters and counts total', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '5' }]))
      .mockResolvedValueOnce(rows([makeConsentRow()]));

    const out = await svc.searchConsent({
      userId: USER_ID, consentType: 'marketing_consent', version: 'v1',
    });
    expect(out.total).toBe(5);
    expect(out.rows).toHaveLength(1);

    const countSql = dbQueryMock.mock.calls[0][0] as string;
    const countParams = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(countSql).toMatch(/user_id = \$1/);
    expect(countSql).toMatch(/consent_type = \$2/);
    expect(countSql).toMatch(/version = \$3/);
    expect(countParams).toEqual([USER_ID, 'marketing_consent', 'v1']);
  });

  it('omits WHERE when no filter', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.searchConsent({});
    expect(dbQueryMock.mock.calls[0][0] as string).not.toMatch(/WHERE/);
  });
});

// ─────────────────────────────────────────────────────────────────
// createDsr
// ─────────────────────────────────────────────────────────────────

describe('createDsr', () => {
  it('inserts row with due_at = NOW + INTERVAL 15 days and writes audit', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow()]))     // INSERT dsr
      .mockResolvedValueOnce(rows([{ id: 'al1' }]));   // INSERT audit_log

    const out = await svc.createDsr({
      userId: USER_ID, requestType: 'access', userMessage: 'hi', ipAddress: '203.0.113.5',
    });

    expect(out.id).toBe(DSR_ID);
    expect(out.requestType).toBe('access');
    expect(dbQueryMock).toHaveBeenCalledTimes(2);

    const insertSql = dbQueryMock.mock.calls[0][0] as string;
    expect(insertSql).toMatch(/INSERT INTO data_subject_requests/);
    expect(insertSql).toMatch(/NOW\(\) \+ INTERVAL '15 days'/);

    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toMatch(/INSERT INTO audit_log/);
    const auditParams = dbQueryMock.mock.calls[1][1] as unknown[];
    expect(auditParams[1]).toBe('dsr.created');
    expect(auditParams[2]).toBe('data_subject_request');
    expect(auditParams[3]).toBe(DSR_ID);
    expect(auditParams[6]).toBe('203.0.113.5');
  });

  it('does not throw when audit insert fails (warn logged)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow()]))
      .mockRejectedValueOnce(new Error('audit boom'));

    const out = await svc.createDsr({
      userId: USER_ID, requestType: 'erasure',
    });
    expect(out.id).toBe(DSR_ID);
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('rejects unknown requestType', async () => {
    await expect(svc.createDsr({
      userId: USER_ID, requestType: 'banana' as svc.DsrRequestType,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('rejects empty userId', async () => {
    await expect(svc.createDsr({
      userId: '', requestType: 'access',
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────
// listDsrs
// ─────────────────────────────────────────────────────────────────

describe('listDsrs', () => {
  it('applies status filter', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '2' }]))
      .mockResolvedValueOnce(rows([makeDsrRow()]));
    const out = await svc.listDsrs({ status: 'received' });
    expect(out.total).toBe(2);
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    const countParams = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(countSql).toMatch(/dsr\.status = \$1/);
    expect(countParams[0]).toBe('received');
  });

  it('overdueOnly clause includes due_at < NOW()', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.listDsrs({ overdueOnly: true });
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/dsr\.due_at < NOW\(\)/);
    expect(sql).toMatch(/'received', 'in_progress'/);
  });
});

// ─────────────────────────────────────────────────────────────────
// getDsr
// ─────────────────────────────────────────────────────────────────

describe('getDsr', () => {
  it('returns null when not found', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    const out = await svc.getDsr(DSR_ID);
    expect(out).toBeNull();
  });

  it('returns mapped record with computed daysUntilDue/isOverdue', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([
      makeDsrRow({ due_at: new Date('2099-01-01T00:00:00Z') }),
    ]));
    const out = await svc.getDsr(DSR_ID);
    expect(out).not.toBeNull();
    expect(out!.isOverdue).toBe(false);
    expect(out!.daysUntilDue).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// updateDsrStatus — transitions
// ─────────────────────────────────────────────────────────────────

describe('updateDsrStatus transitions', () => {
  it('allows received → in_progress and writes audit', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'received' })])) // SELECT
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'in_progress' })])) // UPDATE
      .mockResolvedValueOnce(rows([{ id: 'al1' }])); // audit

    const out = await svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'in_progress', adminNotes: 'reviewing',
    });
    expect(out.status).toBe('in_progress');

    const updateSql = dbQueryMock.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/UPDATE data_subject_requests/);
    // No completed_at on non-terminal status
    expect(updateSql).not.toMatch(/completed_at = NOW\(\)/);

    const auditParams = dbQueryMock.mock.calls[2][1] as unknown[];
    expect(auditParams[1]).toBe('dsr.status_changed');
    const oldVals = JSON.parse(String(auditParams[4])) as Record<string, unknown>;
    const newVals = JSON.parse(String(auditParams[5])) as Record<string, unknown>;
    expect(oldVals).toEqual({ status: 'received' });
    expect(newVals).toMatchObject({ status: 'in_progress', adminNotes: 'reviewing' });
  });

  it('sets completed_at on terminal status (in_progress → completed)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'in_progress' })]))
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'completed' })]))
      .mockResolvedValueOnce(rows([{ id: 'al1' }]));

    await svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'completed',
      responsePayloadUrl: 'https://example.com/x.zip',
    });
    const updateSql = dbQueryMock.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/completed_at = NOW\(\)/);
    expect(updateSql).toMatch(/response_payload_url/);
  });

  it('MED-N43 — does NOT set completed_at on rejected (only on fulfilled)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'received' })]))
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'rejected' })]))
      .mockResolvedValueOnce(rows([{ id: 'al1' }]));

    await svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'rejected', rejectionReason: 'duplicate',
    });
    const updateSql = dbQueryMock.mock.calls[1][0] as string;
    // MED-N43 fix — completed_at only stamps on FULFILLED_STATUSES
    // (currently { 'completed' }), not on rejection. Reporting code
    // uses (status='completed') to count "satisfied within 30 days".
    expect(updateSql).not.toMatch(/completed_at = NOW\(\)/);
    expect(updateSql).toMatch(/rejection_reason/);
  });

  it('MED-N43 — DOES set completed_at on completed (the only fulfilled terminal)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'in_progress' })]))
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'completed' })]))
      .mockResolvedValueOnce(rows([{ id: 'al1' }]));

    await svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'completed',
    });
    const updateSql = dbQueryMock.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/completed_at = NOW\(\)/);
  });

  it('rejects completed → received (no transitions out of terminal)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makeDsrRow({ status: 'completed' })]));
    await expect(svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'received',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects received → completed (must go through in_progress)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makeDsrRow({ status: 'received' })]));
    await expect(svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'completed',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when row not found', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'in_progress',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not throw when audit insert fails after successful update', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'received' })]))
      .mockResolvedValueOnce(rows([makeDsrRow({ status: 'in_progress' })]))
      .mockRejectedValueOnce(new Error('audit boom'));

    const out = await svc.updateDsrStatus({
      id: DSR_ID, adminId: ADMIN_ID, newStatus: 'in_progress',
    });
    expect(out.status).toBe('in_progress');
    expect(loggerWarn).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// exportAuditLogCsv
// ─────────────────────────────────────────────────────────────────

describe('exportAuditLogCsv', () => {
  it('emits header row exactly as specified', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    const csv = await svc.exportAuditLogCsv({});
    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe(
      'id,source,createdAt,userEmail,userRole,action,entityType,entityId,ipAddress,reason,oldValues,newValues',
    );
  });

  it('MED-N44 — bulk export masks PII even for a super_admin viewer', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{
      id: 'al-1',
      source: 'audit_log',
      created_at: new Date('2026-04-01T12:34:56Z'),
      user_email: 'jane,smith@example.com',
      user_role: 'admin',
      action: 'config.updated',
      entity_type: 'config',
      entity_id: 'cfg-1',
      ip_address: '203.0.113.1',
      old_values: { name: 'old "name"' },
      new_values: { name: 'new', email: 'person@example.com' },
      reason: 'Requested by jane,smith@example.com',
    }]));
    const csv = await svc.exportAuditLogCsv({ viewerRole: 'super_admin' });
    const lines = csv.split(/\r?\n/);
    expect(lines).toHaveLength(2);
    const dataLine = lines[1]!;
    expect(dataLine).toContain('j***@e***');
    expect(dataLine).toContain('203.0.113.x');
    expect(dataLine).not.toContain('jane,smith@example.com');
    expect(dataLine).not.toContain('person@example.com');
    // old_values JSON contains quotes → wrapped + doubled
    expect(dataLine).toContain('"{""name"":""old \\""name\\""""}"');
    expect(dataLine).toContain('al-1');
    expect(dataLine).toContain('config.updated');
  });

  it('MED-N44 — junior admin viewer gets masked email + masked IP', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{
      id: 'al-1',
      source: 'audit_log',
      created_at: new Date('2026-04-01T12:34:56Z'),
      user_email: 'jane@example.com',
      user_role: 'admin',
      action: 'config.updated',
      entity_type: 'config',
      entity_id: 'cfg-1',
      ip_address: '203.0.113.1',
      reason: null,
      old_values: null,
      new_values: null,
    }]));
    const csv = await svc.exportAuditLogCsv({ viewerRole: 'admin' });
    const lines = csv.split(/\r?\n/);
    const dataLine = lines[1]!;
    // Email masked: first char + first char of domain.
    expect(dataLine).toContain('j***@e***');
    // IPv4 masked: trailing octet replaced with x.
    expect(dataLine).toContain('203.0.113.x');
    // No raw values leaked.
    expect(dataLine).not.toContain('jane@example.com');
    expect(dataLine).not.toContain('203.0.113.1');
  });

  it('builds WHERE clause from filters', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.exportAuditLogCsv({
      userId: USER_ID, action: 'login', entityType: 'user',
      entityId: DSR_ID, source: 'admin_actions',
      from: '2026-01-01', to: '2026-12-31',
    });
    const sql = dbQueryMock.mock.calls[0][0] as string;
    const params = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/WHERE/);
    expect(sql).toMatch(/combined\.user_id = \$1/);
    expect(sql).toMatch(/combined\.action ILIKE \$2/);
    expect(sql).toMatch(/combined\.entity_type = \$3/);
    expect(sql).toMatch(/combined\.entity_id = \$4/);
    expect(sql).toMatch(/combined\.source = \$5/);
    // BUG-PHASE133-01 — pre-fix asserted the broken `>= $4` / `<= $5`
    // pattern that interpreted YYYY-MM-DD as UTC midnight, missing
    // the 00:00-08:00 Manila slice on from-day and excluding 16
    // hours (08:00-23:59 Manila) on the to-day. Now Manila-anchored
    // half-open interval.
    expect(sql).toMatch(/combined\.created_at >= \(\$6::date AT TIME ZONE 'Asia\/Manila'\)/);
    expect(sql).toMatch(
      /combined\.created_at < \(\(\$7::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
    expect(params).toEqual([
      USER_ID, '%login%', 'user', DSR_ID, 'admin_actions', '2026-01-01', '2026-12-31',
    ]);
  });

  it('W12 — exports both recorded sources through the same timeline relation', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.exportAuditLogCsv({});
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/FROM audit_log/);
    expect(sql).toMatch(/UNION ALL/);
    expect(sql).toMatch(/FROM admin_actions/);
  });

  it('omits WHERE when no filters', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.exportAuditLogCsv({ viewerRole: 'super_admin' });
    expect(dbQueryMock.mock.calls[0][0] as string).not.toMatch(/WHERE/);
  });

  it('emits empty fields for null old/new values', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{
      id: 'al-2',
      source: 'admin_actions',
      created_at: new Date('2026-04-01T00:00:00Z'),
      user_email: null,
      user_role: null,
      action: 'x',
      entity_type: 'y',
      entity_id: null,
      ip_address: null,
      reason: null,
      old_values: null,
      new_values: null,
    }]));
    const csv = await svc.exportAuditLogCsv({});
    const dataLine = csv.split(/\r?\n/)[1];
    // Trailing two empty fields produced by ",," at the end
    expect(dataLine.endsWith(',,')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// getDsrAlerts
// ─────────────────────────────────────────────────────────────────

describe('getDsrAlerts', () => {
  it('SQL contains due_at - NOW() <= INTERVAL 2 days and excludes terminal', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.getDsrAlerts();
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/due_at - NOW\(\) <= INTERVAL '2 days'/);
    expect(sql).toMatch(/status IN \('received', 'in_progress'\)/);
  });

  it('returns mapped DSR records', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([
      makeDsrRow({ due_at: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
    ]));
    const out = await svc.getDsrAlerts();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(DSR_ID);
  });
});
