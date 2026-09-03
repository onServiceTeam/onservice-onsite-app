const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateFeedbackTriage } from '../src/services/feedback-admin.service';

it('Bug UX-875 — concurrent feedback decisions preserve one audit transition and reject the stale overwrite', async () => {
  const feedbackId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  let persisted = {
    status: 'new',
    assigned_admin_id: null as string | null,
    triage_note: null as string | null,
    updated_at: new Date('2026-08-24T00:00:00.000Z'),
  };
  const auditTransitions: unknown[][] = [];
  let transactionTail: Promise<unknown> = Promise.resolve();

  const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (/SELECT status, assigned_admin_id, triage_note, updated_at/.test(sql)) {
      return { rows: [{ ...persisted }], rowCount: 1 };
    }
    if (/SELECT id FROM users/.test(sql)) {
      return { rows: [{ id: ownerId }], rowCount: 1 };
    }
    if (/UPDATE feedback_submissions/.test(sql)) {
      persisted = {
        status: String(params[1]),
        assigned_admin_id: String(params[2]),
        triage_note: String(params[3]),
        updated_at: new Date(persisted.updated_at.getTime() + 1),
      };
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO audit_log/.test(sql)) {
      auditTransitions.push(params);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  dbTransactionMock.mockImplementation((callback: unknown) => {
    const run = transactionTail.then(() => (
      callback as (client: { query: typeof clientQuery }) => Promise<unknown>
    )({ query: clientQuery }));
    transactionTail = run.catch(() => undefined);
    return run;
  });
  dbQueryMock.mockImplementation(async () => ({
    rows: [{
      id: feedbackId,
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: persisted.updated_at,
      tester_name: 'Tester',
      tester_contact: null,
      role: 'provider',
      device: 'Tablet browser',
      areas: ['provider'],
      nps: 5,
      summary: 'Checklist issue',
      item_count: 1,
      payload: {},
      ...persisted,
      assigned_first_name: 'Ana',
      assigned_last_name: 'Reyes',
    }],
  }));

  const expectedUpdatedAt = persisted.updated_at.toISOString();
  const base = {
    feedbackId,
    assignedAdminId: ownerId,
    actorRole: 'admin',
    status: 'triaged',
    expectedUpdatedAt,
  };
  const first = updateFeedbackTriage({
    ...base,
    adminId: '33333333-3333-4333-8333-333333333333',
    note: 'Accepted and linked to the provider checklist fix.',
  });
  const second = updateFeedbackTriage({
    ...base,
    adminId: '44444444-4444-4444-8444-444444444444',
    note: 'A second operator attempted a stale decision.',
  });

  const outcomes = await Promise.allSettled([first, second]);

  expect(outcomes[0]).toMatchObject({ status: 'fulfilled' });
  expect(outcomes[1]).toMatchObject({
    status: 'rejected',
    reason: expect.objectContaining({ statusCode: 409 }),
  });
  expect(persisted.triage_note).toBe('Accepted and linked to the provider checklist fix.');
  expect(auditTransitions).toHaveLength(1);
  expect(clientQuery.mock.calls.filter(([sql]) => /FOR UPDATE/.test(String(sql)))).toHaveLength(2);
});
