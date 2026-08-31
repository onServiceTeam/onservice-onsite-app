// LAUNCH-LIMITATIONS #8 — erasure DSR now auto-triggers the
// account-deletion pipeline. Pre-fix the DPO had to do this by hand.

const dbQueryMock = jest.fn();
const requestAccountDeletionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/services/data-management.service', () => ({
  requestAccountDeletion: (...args: unknown[]) => requestAccountDeletionMock(...args),
}));

import * as compliance from '../src/services/compliance.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  requestAccountDeletionMock.mockReset();
});

const USER_ID = '11111111-1111-4111-8111-111111111111';

function dsrInsertReturn(requestType: string): unknown {
  return {
    rows: [{
      id: 'dsr-1',
      user_id: USER_ID,
      request_type: requestType,
      status: 'received',
      user_email: null,
      user_message: null,
      received_at: new Date(),
      due_at: new Date(Date.now() + 86_400_000 * 15),
      closed_at: null,
      fulfillment_url: null,
      rejection_reason: null,
      fulfillment_summary: null,
      info_request_message: null,
      info_request_at: null,
      escalated_to_npc_at: null,
      escalation_reference: null,
      assignee_id: null,
    }],
    rowCount: 1,
  };
}

describe('LAUNCH-LIMITATIONS #8 — erasure DSR auto-links to account deletion', () => {
  it('#8 — erasure request triggers requestAccountDeletion', async () => {
    dbQueryMock.mockResolvedValueOnce(dsrInsertReturn('erasure'));
    // writeAudit's INSERT
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    requestAccountDeletionMock.mockResolvedValueOnce({});

    await compliance.createDsr({ userId: USER_ID, requestType: 'erasure' });

    expect(requestAccountDeletionMock).toHaveBeenCalledTimes(1);
    expect(requestAccountDeletionMock).toHaveBeenCalledWith(
      USER_ID,
      expect.stringContaining('Auto-linked from DSR dsr-1'),
    );
  });

  it('#8 — non-erasure request does NOT trigger requestAccountDeletion', async () => {
    dbQueryMock.mockResolvedValueOnce(dsrInsertReturn('access'));
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await compliance.createDsr({ userId: USER_ID, requestType: 'access' });

    expect(requestAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('#8 — auto-trigger failure does NOT roll back the DSR insert', async () => {
    dbQueryMock.mockResolvedValueOnce(dsrInsertReturn('erasure'));
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Existing pending deletion request → service throws.
    requestAccountDeletionMock.mockRejectedValueOnce(
      new Error('You already have a pending account deletion request.'),
    );

    const result = await compliance.createDsr({
      userId: USER_ID,
      requestType: 'erasure',
    });

    // The DSR is still returned and the current internal target is preserved.
    expect(result.id).toBe('dsr-1');
    expect(result.requestType).toBe('erasure');
  });
});
