const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { approveProvider } from '../src/services/admin.service';

it('Bug UX-434 — provider approval requires and transactionally preserves the review rationale and checklist', async () => {
  await expect(
    approveProvider('provider-1', 'admin-1', {
      reason: '',
      checklistConfirmed: true,
      checklistSummary: 'Vetting checklist confirmed (10/10).',
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(queryMock).not.toHaveBeenCalled();
  expect(transactionMock).not.toHaveBeenCalled();

  const transactionCalls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        transactionCalls.push({ sql, params });
        if (/SELECT status, nbi_clearance_url/.test(sql)) {
          return { rows: [{ status: 'pending', nbi_clearance_url: 'private/nbi.pdf',
            government_id_front_url: 'private/id.jpg', government_id_back_url: 'private/id-back.jpg',
            selfie_url: 'private/selfie.jpg' }], rowCount: 1 };
        }
        if (/UPDATE providers/.test(sql)) {
          return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [{ id: 'written' }], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<void>)(client);
  });

  const reason = 'Identity, qualifications, service scope, and references were verified.';
  const checklistSummary = 'Vetting checklist confirmed (10/10): all required review items passed.';
  await approveProvider('provider-1', 'admin-1', {
    reason,
    checklistConfirmed: true,
    checklistSummary,
  });

  const audit = transactionCalls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit).toBeDefined();
  expect(audit?.params[3]).toBe(reason);
  expect(audit?.params[4]).toContain(reason);
  expect(audit?.params[4]).toContain(checklistSummary);
  expect(queryMock).not.toHaveBeenCalled();
});
