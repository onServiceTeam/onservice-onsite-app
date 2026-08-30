import express from 'express';
import request from 'supertest';

const acceptInvite = jest.fn();
const formatProviderStaff = jest.fn();
const createTokenPair = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'member-570', role: 'customer', sessionVersion: 7 };
    next();
  },
}));
jest.mock('../src/services/provider-staff.service', () => ({
  acceptInvite: (...args: unknown[]) => acceptInvite(...args),
  formatProviderStaff: (...args: unknown[]) => formatProviderStaff(...args),
}));
jest.mock('../src/services/auth.service', () => ({
  createTokenPair: (...args: unknown[]) => createTokenPair(...args),
}));

import providerStaffRoutes from '../src/routes/provider-staff.routes';

it('Bug UX-570 — team-member acceptance preserves the canonical session generation in its new role token', async () => {
  acceptInvite.mockResolvedValue({ id: 'staff-570' });
  formatProviderStaff.mockReturnValue({ id: 'staff-570' });
  createTokenPair.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/staff', providerStaffRoutes);

  const response = await request(app).post('/api/v1/staff/accept/staff-570');

  expect(response.status).toBe(200);
  expect(createTokenPair).toHaveBeenCalledWith('member-570', 'provider_staff', 7);
});
