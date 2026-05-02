/**
 * Phase 13 Dispatch C — DSR end-to-end flow tests (hermetic).
 *
 * Mocks db.query and logger; no real SQL. Asserts:
 *   1. Customer DSR submission (access, erasure, correction) routes through
 *      svc.createDsr with the correct request_type.
 *   2. createDsr SQL includes the 15-day SLA expression.
 *   3. Admin can list DSRs (svc.listDsrs).
 *   4. Admin markDsrComplete writes admin_actions verb 'dsr_marked_complete'
 *      against target_type 'dsr_request'.
 *   5. requestDsrMoreInfo writes 'dsr_more_info_requested', moves status to
 *      in_progress when starting from received, keeps existing notes.
 *   6. rejectDsr writes 'dsr_rejected' with the supplied reason and sets status.
 *   7. escalateDsrToNpc writes 'dsr_escalated_to_npc' with the NPC reference
 *      embedded in details.
 *   8. Validation: erasure flow (any DSR submission via API) requires a valid
 *      request_type — the customer-side typed-DELETE confirmation lives in the
 *      mobile UI; here we assert createDsr rejects unknown request_type.
 *   9. markDsrComplete on already-completed DSR rejects with 409.
 *  10. Audit verbs all map to allowlist defined in migration 058.
 *  11. Reject requires reason ≥ 20 chars; escalate requires npcReference.
 *  12. Admin actions never throw the main path on audit insert failure.
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

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

const createNotificationMock = jest.fn();

jest.mock('../src/services/notification.service', () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
}));

import * as customerSvc from '../src/services/compliance.service';
import * as adminSvc from '../src/services/compliance-admin.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

const USER_ID = 'u0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const DSR_ID = 'd0000000-0000-0000-0000-000000000001';

// Verbs added by migration 058. Keeping in sync ensures any test asserting
// against an unknown verb breaks here loudly rather than at runtime.
const PHASE13_DSR_VERBS = new Set([
  'dsr_marked_complete',
  'dsr_more_info_requested',
  'dsr_rejected',
  'dsr_escalated_to_npc',
  'consent_version_published',
]);

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
    user_message: null,
    admin_notes: null,
    response_payload_url: null,
    rejection_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  loggerDebug.mockReset();
  createNotificationMock.mockReset();
  createNotificationMock.mockResolvedValue({ id: 'n-1' });
  // Default trx passthrough so dbQueryMock-based tests still see all
  // queries through the same mock (MED-N122 fix wraps DSR mutations
  // in db.transaction).
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Customer-side DSR submission
// ─────────────────────────────────────────────────────────────────

describe('createDsr (customer)', () => {
  it('submits an access request and returns a mapped record', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ request_type: 'access' })]))
      .mockResolvedValueOnce(rows([])); // audit_log insert

    const out = await customerSvc.createDsr({
      userId: USER_ID, requestType: 'access', userMessage: 'please',
    });

    expect(out.requestType).toBe('access');
    const insertSql = dbQueryMock.mock.calls[0][0] as string;
    expect(insertSql).toMatch(/INSERT INTO data_subject_requests/);
  });

  it('submits an erasure request', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ request_type: 'erasure' })]))
      .mockResolvedValueOnce(rows([]));

    const out = await customerSvc.createDsr({
      userId: USER_ID, requestType: 'erasure', userMessage: null,
    });
    expect(out.requestType).toBe('erasure');
  });

  it('submits a correction request', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow({ request_type: 'correction' })]))
      .mockResolvedValueOnce(rows([]));

    const out = await customerSvc.createDsr({
      userId: USER_ID, requestType: 'correction',
    });
    expect(out.requestType).toBe('correction');
  });

  it('computes a 15-day SLA in SQL', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeDsrRow()]))
      .mockResolvedValueOnce(rows([]));

    await customerSvc.createDsr({ userId: USER_ID, requestType: 'access' });
    const insertSql = dbQueryMock.mock.calls[0][0] as string;
    expect(insertSql).toMatch(/NOW\(\) \+ INTERVAL '15 days'/);
  });

  it('rejects an unknown request_type', async () => {
    await expect(customerSvc.createDsr({
      userId: USER_ID,
      requestType: 'shenanigans' as unknown as customerSvc.DsrRequestType,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// Admin listing
// ─────────────────────────────────────────────────────────────────

describe('listDsrs (admin)', () => {
  it('returns rows + total', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '2' }]))
      .mockResolvedValueOnce(rows([makeDsrRow(), makeDsrRow({ id: 'd2' })]));

    const out = await customerSvc.listDsrs({ status: 'received' });
    expect(out.total).toBe(2);
    expect(out.rows).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────
// markDsrComplete
// ─────────────────────────────────────────────────────────────────

describe('markDsrComplete', () => {
  it('marks complete, sets completed_at, writes audit row with correct verb', async () => {
    dbQueryMock
      // loadDsr current
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'in_progress',
        admin_notes: null, completed_at: null,
      }]))
      // UPDATE returning
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'completed',
        completed_at: new Date('2026-04-20T00:00:00Z'),
        handled_by: ADMIN_ID,
        response_payload_url: 'https://s3.example/dsr.zip',
      })]))
      // admin_actions insert
      .mockResolvedValueOnce(rows([]));

    const out = await adminSvc.markDsrComplete({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
      responsePayloadUrl: 'https://s3.example/dsr.zip',
    });

    expect(out.status).toBe('completed');
    expect(out.completedAt).toBeTruthy();
    const auditCall = dbQueryMock.mock.calls[2];
    const auditSql = auditCall[0] as string;
    const auditParams = auditCall[1] as unknown[];
    expect(auditSql).toMatch(/INSERT INTO admin_actions/);
    expect(auditParams[1]).toBe('dsr_marked_complete');
    expect(auditParams[2]).toBe('dsr_request');
    expect(auditParams[3]).toBe(DSR_ID);
    expect(PHASE13_DSR_VERBS.has(auditParams[1] as string)).toBe(true);
  });

  it('rejects already-completed DSR with 409', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{
      id: DSR_ID, user_id: USER_ID, status: 'completed',
      admin_notes: null, completed_at: new Date(),
    }]));

    await expect(adminSvc.markDsrComplete({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('still resolves when audit insert throws (warn logged)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'received',
        admin_notes: null, completed_at: null,
      }]))
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'completed', completed_at: new Date(), handled_by: ADMIN_ID,
      })]))
      .mockRejectedValueOnce(new Error('audit boom'));

    const out = await adminSvc.markDsrComplete({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
    });
    expect(out.status).toBe('completed');
    expect(loggerWarn).toHaveBeenCalledWith(
      'audit_log insert failed',
      expect.objectContaining({ actionType: 'dsr_marked_complete' }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// requestDsrMoreInfo
// ─────────────────────────────────────────────────────────────────

describe('requestDsrMoreInfo', () => {
  it('moves received -> in_progress, appends note, writes audit', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'received',
        admin_notes: null, completed_at: null,
      }]))
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'in_progress', handled_by: ADMIN_ID,
        admin_notes: '[stamp] More info requested: please send proof of identity',
      })]))
      .mockResolvedValueOnce(rows([]));

    const out = await adminSvc.requestDsrMoreInfo({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
      infoNeeded: 'please send proof of identity',
    });

    expect(out.status).toBe('in_progress');
    const updateParams = dbQueryMock.mock.calls[1][1] as unknown[];
    // status param is 2nd ($2)
    expect(updateParams[1]).toBe('in_progress');
    // MED-N122 fix — audit insert is in-trx with action_type INLINED
    // in the SQL string (not a parameter). Assert by SQL shape.
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'dsr_more_info_requested'/);
    expect(auditCall![0]).toMatch(/'dsr_request'/);
  });

  it('rejects info needed shorter than 10 chars', async () => {
    await expect(adminSvc.requestDsrMoreInfo({
      dsrId: DSR_ID, adminUserId: ADMIN_ID, infoNeeded: 'short',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('notifies the DSR owner with type dsr_info_requested and reference number', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'received',
        admin_notes: null, completed_at: null,
      }]))
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'in_progress', handled_by: ADMIN_ID,
        admin_notes: '[stamp] More info requested: please send proof of identity within 7 days',
      })]))
      .mockResolvedValueOnce(rows([])); // audit insert

    await adminSvc.requestDsrMoreInfo({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
      infoNeeded: 'please send proof of identity within 7 days',
    });

    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const call = createNotificationMock.mock.calls[0][0] as {
      userId: string;
      type: string;
      title: string;
      body: string;
      data: { dsrId: string; referenceNumber: string };
    };
    expect(call.userId).toBe(USER_ID);
    expect(call.type).toBe('dsr_info_requested');
    expect(call.body).toMatch(/please send proof of identity/);
    expect(call.data.dsrId).toBe(DSR_ID);
    expect(call.data.referenceNumber).toBe(DSR_ID.slice(-8).toUpperCase());
  });
});

// ─────────────────────────────────────────────────────────────────
// rejectDsr
// ─────────────────────────────────────────────────────────────────

describe('rejectDsr', () => {
  it('sets status=rejected, writes rejection_reason and audit row', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'in_progress',
        admin_notes: null, completed_at: null,
      }]))
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'rejected',
        rejection_reason: 'Identity could not be verified after multiple attempts.',
        handled_by: ADMIN_ID,
        completed_at: new Date(),
      })]))
      .mockResolvedValueOnce(rows([]));

    const out = await adminSvc.rejectDsr({
      dsrId: DSR_ID, adminUserId: ADMIN_ID,
      reason: 'Identity could not be verified after multiple attempts.',
    });

    expect(out.status).toBe('rejected');
    expect(out.rejectionReason).toMatch(/Identity could not be verified/);
    // MED-N122 fix — audit insert is in-trx with action_type INLINED
    // in the SQL (not a parameter). MED-N124 — reason is now $4
    // (admin_id, target_id, details, reason).
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'dsr_rejected'/);
    expect(auditCall![0]).toMatch(/'dsr_request'/);
    const auditParams = auditCall![1] as unknown[];
    expect(auditParams[3]).toMatch(/Identity could not be verified/);
  });

  it('rejects reason shorter than 20 chars', async () => {
    await expect(adminSvc.rejectDsr({
      dsrId: DSR_ID, adminUserId: ADMIN_ID, reason: 'too short',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// escalateDsrToNpc
// ─────────────────────────────────────────────────────────────────

describe('escalateDsrToNpc', () => {
  it('writes audit row with NPC reference in details, status remains in_progress', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        id: DSR_ID, user_id: USER_ID, status: 'in_progress',
        admin_notes: null, completed_at: null,
      }]))
      .mockResolvedValueOnce(rows([makeDsrRow({
        status: 'in_progress', handled_by: ADMIN_ID,
        admin_notes: '[stamp] Escalated to NPC: NPC-2026-04-1234',
      })]))
      .mockResolvedValueOnce(rows([]));

    const out = await adminSvc.escalateDsrToNpc({
      dsrId: DSR_ID, adminUserId: ADMIN_ID, npcReference: 'NPC-2026-A1B2C3',
    });

    expect(out.status).toBe('in_progress');
    const auditCall = dbQueryMock.mock.calls[2];
    const auditParams = auditCall[1] as unknown[];
    expect(auditParams[1]).toBe('dsr_escalated_to_npc');
    expect(auditParams[2]).toBe('dsr_request');
    const detailsJson = JSON.parse(auditParams[4] as string) as Record<string, unknown>;
    expect(detailsJson.npcReference).toBe('NPC-2026-A1B2C3');
  });

  it('rejects empty NPC reference', async () => {
    await expect(adminSvc.escalateDsrToNpc({
      dsrId: DSR_ID, adminUserId: ADMIN_ID, npcReference: '',
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────
// publishConsentVersion (sanity bundle)
// ─────────────────────────────────────────────────────────────────

describe('publishConsentVersion', () => {
  it('rejects duplicate (consent_type, version)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'existing' }]));

    await expect(adminSvc.publishConsentVersion({
      adminUserId: ADMIN_ID,
      consentType: 'privacy_policy',
      version: '1.2',
      changeSummary: 'Some update that is at least thirty characters long.',
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('writes admin_actions row with verb consent_version_published', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // duplicate check empty
      .mockResolvedValueOnce(rows([{ id: 'pub-1', created_at: new Date() }]));

    const out = await adminSvc.publishConsentVersion({
      adminUserId: ADMIN_ID,
      consentType: 'privacy_policy',
      version: '1.3',
      changeSummary: 'Clarified the lawful basis section and added DPO contact info.',
    });

    expect(out.consentType).toBe('privacy_policy');
    const insertSql = dbQueryMock.mock.calls[1][0] as string;
    expect(insertSql).toMatch(/INSERT INTO admin_actions/);
    expect(insertSql).toMatch(/'consent_version_published'/);
    expect(insertSql).toMatch(/'consent_version'/);
  });
});
