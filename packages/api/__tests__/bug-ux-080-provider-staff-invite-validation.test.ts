import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'provider',
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

const mockCreateStaffInvite = jest.fn().mockResolvedValue({ id: 'staff-1' });
jest.mock('../src/services/provider-staff.service', () => ({
  createStaffInvite: (...args: unknown[]) => mockCreateStaffInvite(...args),
  formatProviderStaff: (staff: unknown) => staff,
}));

jest.mock('../src/services/provider.service', () => ({
  getProviderByUserId: jest.fn().mockResolvedValue({ id: 'provider-1' }),
}));

import providerRouter from '../src/routes/provider.routes';

it('Bug UX-080 — provider staff invite route rejects malformed values and passes normalized bounded contacts', async () => {
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);

  const malformed = await request(app).post('/providers/staff').send({ phone: 'garbage' });
  expect(malformed.status).toBe(400);
  expect(malformed.body.error.details[0].message).toMatch(/valid PH mobile number/i);
  expect(mockCreateStaffInvite).not.toHaveBeenCalled();

  const oversized = await request(app).post('/providers/staff').send({
    email: 'team@example.com',
    roleTitle: 'x'.repeat(101),
  });
  expect(oversized.status).toBe(400);
  expect(mockCreateStaffInvite).not.toHaveBeenCalled();

  const valid = await request(app).post('/providers/staff').send({
    phone: '0917 123 4567',
    email: '  TEAM.Member@Example.COM ',
    roleTitle: '  Aircon technician  ',
  });
  expect(valid.status).toBe(201);
  expect(mockCreateStaffInvite).toHaveBeenCalledWith({
    providerId: 'provider-1',
    invitedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    phone: '+639171234567',
    email: 'team.member@example.com',
    roleTitle: 'Aircon technician',
  });
});
