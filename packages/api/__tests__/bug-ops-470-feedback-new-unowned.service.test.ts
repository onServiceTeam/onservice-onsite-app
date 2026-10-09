const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { transaction: (...args: unknown[]) => transactionMock(...args), query: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateFeedbackTriage } from '../src/services/feedback-admin.service';

it('Bug OPS-470 — feedback returned to new cannot retain an owner', async () => {
  await expect(updateFeedbackTriage({
    feedbackId: '11111111-1111-4111-8111-111111111111',
    adminId: '22222222-2222-4222-8222-222222222222',
    actorRole: 'admin',
    status: 'new',
    assignedAdminId: '33333333-3333-4333-8333-333333333333',
    note: 'Returned for another review.',
    expectedUpdatedAt: '2026-08-24T00:00:00.000Z',
  })).rejects.toMatchObject({
    statusCode: 400,
    message: 'New feedback must remain unassigned until an owner accepts it.',
  });
  expect(transactionMock).not.toHaveBeenCalled();
});
