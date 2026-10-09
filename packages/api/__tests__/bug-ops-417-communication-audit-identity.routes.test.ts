import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('Bug OPS-417 - audit timeline resolves retained conversation and message identity from communication records', async () => {
  const bookingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const messageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockImplementationOnce(async (sql: string) => {
      const resolvesCommunicationIdentity = sql.includes("'conversation_viewed'")
        && sql.includes("'message_redacted'")
        && sql.includes("combined.new_values->>'messageId'")
        && sql.includes('FROM messages message')
        && sql.includes('JOIN conversations conversation')
        && sql.includes('AS target_conversation_id')
        && sql.includes('AS target_message_id');
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions',
          user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', action: 'message_redacted',
          entity_type: 'booking', entity_id: bookingId, old_values: null,
          new_values: { messageId, reason: 'off-platform payment request' },
          ip_address: null, user_agent: null, reason: null,
          created_at: new Date('2026-09-03T11:00:00.000Z'), user_email: 'operator@example.com',
          user_role: 'super_admin', target_user_role: null, target_provider_id: null,
          target_booking_id: null, target_tax_year: null, target_tax_quarter: null,
          target_tax_month: null, target_category_id: null, target_subcategory_id: null,
          target_conversation_id: resolvesCommunicationIdentity ? conversationId : null,
          target_message_id: resolvesCommunicationIdentity ? messageId : null,
        }],
        rowCount: 1,
      };
    });

  const app = express();
  app.use('/admin', adminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request,
    res: express.Response, _next: express.NextFunction) => (
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' })
  ));

  const response = await request(app).get('/admin/audit-log');

  expect(response.status).toBe(200);
  expect(response.body.data[0]).toEqual(expect.objectContaining({
    action: 'message_redacted', entityType: 'booking', entityId: bookingId,
    targetConversationId: conversationId, targetMessageId: messageId,
  }));
});
