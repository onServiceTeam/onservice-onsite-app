import express from 'express';
import request from 'supertest';

const listPendingAreaChanges = jest.fn();
const getLegacyPasswordStats = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'dpo-572', role: 'dpo', sessionVersion: 2 };
    next();
  },
}));
jest.mock('../src/services/provider-onboarding.service', () => ({}));
jest.mock('../src/services/service-area-change.service', () => ({
  listPending: (...args: unknown[]) => listPendingAreaChanges(...args),
}));
jest.mock('../src/services/admin-2fa.service', () => ({}));
jest.mock('../src/services/security.service', () => ({}));
jest.mock('../src/services/admin-password-rotation.service', () => ({
  getLegacyPasswordStats: (...args: unknown[]) => getLegacyPasswordStats(...args),
}));

import adminLatentRoutes from '../src/routes/admin-latent.routes';
import securityRoutes from '../src/routes/security.routes';

it('Bug UX-572 — DPO credentials cannot reach residual marketplace or workforce telemetry endpoints', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminLatentRoutes);
  app.use('/api/v1/security', securityRoutes);
  app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  expect((await request(app).get('/api/v1/admin/service-area-changes')).status).toBe(403);
  expect((await request(app).get('/api/v1/security/admin/legacy-password-stats')).status).toBe(403);
  expect(listPendingAreaChanges).not.toHaveBeenCalled();
  expect(getLegacyPasswordStats).not.toHaveBeenCalled();
});
