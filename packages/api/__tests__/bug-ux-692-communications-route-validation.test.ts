import express from 'express';
import request from 'supertest';

const reviewFlagMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '33333333-3333-4333-8333-333333333333',
      role: 'super_admin',
    };
    next();
  },
}));

jest.mock('../src/services/messaging-admin.service', () => ({
  reviewFlag: (...args: unknown[]) => reviewFlagMock(...args),
  redactMessage: jest.fn(),
  listConversationsForAdmin: jest.fn(),
  listModerationQueue: jest.fn(),
  getModerationStats: jest.fn(),
  getConversationThreadForAdmin: jest.fn(),
}));

import messagingAdminRouter from '../src/routes/messaging-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-692 — moderation routes reject malformed IDs and rationale shapes while passing a bounded trimmed decision', async () => {
  const app = express();
  app.use(express.json());
  app.use('/conversations', messagingAdminRouter);
  app.use(errorMiddleware);

  const malformedId = await request(app)
    .post('/conversations/messages/not-a-uuid/review')
    .send({ reviewNote: 'Looks acceptable.' });
  expect(malformedId.status).toBe(400);

  const coercedObject = await request(app)
    .post('/conversations/messages/22222222-2222-4222-8222-222222222222/review')
    .send({ reviewNote: { reason: 'not a string' } });
  expect(coercedObject.status).toBe(400);

  const oversized = await request(app)
    .post('/conversations/messages/22222222-2222-4222-8222-222222222222/review')
    .send({ reviewNote: 'x'.repeat(2001) });
  expect(oversized.status).toBe(400);
  expect(reviewFlagMock).not.toHaveBeenCalled();

  reviewFlagMock.mockResolvedValueOnce({ reviewed: true });
  const valid = await request(app)
    .post('/conversations/messages/22222222-2222-4222-8222-222222222222/review')
    .send({ reviewNote: '  Context confirms no policy violation.  ' });
  expect(valid.status).toBe(200);
  expect(reviewFlagMock).toHaveBeenCalledWith(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'Context confirms no policy violation.',
  );
});
