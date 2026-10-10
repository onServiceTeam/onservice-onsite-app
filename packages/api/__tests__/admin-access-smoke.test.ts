/**
 * Selected real HTTP routes with real JWT/authentication/permission guards.
 * Canonical account reads and downstream list services are mocked. These are
 * three GET boundaries, not an inventory of all methods/owners/admin routes.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockQuery = jest.fn();
const mockProjects = jest.fn();
const mockDsrs = jest.fn();
const mockRoles = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) } }));
jest.mock('../src/services/project.service', () => ({ listProjectsForAdmin: (...args: unknown[]) => mockProjects(...args) }));
jest.mock('../src/services/compliance.service', () => ({ listDsrs: (...args: unknown[]) => mockDsrs(...args) }));
jest.mock('../src/services/staff.service', () => ({ listRoles: (...args: unknown[]) => mockRoles(...args) }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import projectsRouter from '../src/routes/project-admin.routes';
import complianceRouter from '../src/routes/compliance-admin.routes';
import staffRouter from '../src/routes/staff.routes';
import providerStaffRouter from '../src/routes/provider-staff.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const roles = ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo'] as const;
type Role = typeof roles[number];
interface Account { role: Role; is_active: boolean; session_version: number; must_rotate_password: boolean }
const accounts = new Map<string, Account>();
const userIds = Object.fromEntries(roles.map((role, index) => [role, `11111111-1111-4111-8111-11111111111${index}`]));
const secret = 'synthetic-admin-access-smoke-not-a-live-credential';
const savedSecret = process.env.JWT_SECRET;
const app = express();
app.use(express.json(), cookieParser());
app.use('/api/v1/admin/projects', projectsRouter);
app.use('/api/v1/admin/compliance', complianceRouter);
// Preserve the earlier staff self-service mount sharing the real prefix.
app.use('/api/v1/staff', providerStaffRouter);
app.use('/api/v1/staff', staffRouter);
app.use(errorMiddleware);

const boundaries = [
  { path: '/api/v1/admin/projects', allowed: ['admin', 'super_admin'], data: [{ id: 'synthetic-project' }], service: mockProjects },
  { path: '/api/v1/admin/compliance/dsr', allowed: ['dpo', 'super_admin'], data: { rows: [{ id: 'synthetic-dsr' }], total: 1 }, service: mockDsrs },
  { path: '/api/v1/staff/roles', allowed: ['super_admin'], data: [{ id: 'synthetic-role-profile' }], service: mockRoles },
] as const;

function token(role: Role, extra: Record<string, unknown> = {}, expiresIn = 300): string {
  return jwt.sign({ userId: userIds[role], role, sessionVersion: 3, ...extra }, secret, { algorithm: 'HS256', expiresIn });
}

function expectNoDataAccess(): void {
  for (const boundary of boundaries) expect(boundary.service).not.toHaveBeenCalled();
}

beforeEach(() => {
  process.env.JWT_SECRET = secret;
  accounts.clear();
  for (const role of roles) accounts.set(userIds[role]!, { role, is_active: true, session_version: 3, must_rotate_password: false });
  mockQuery.mockReset().mockImplementation(async (_sql: unknown, values: unknown[]) => {
    if (values.length !== 1 || typeof values[0] !== 'string') throw new Error('Unexpected database operation in access smoke');
    const account = accounts.get(values[0]);
    return { rows: account ? [account] : [], rowCount: account ? 1 : 0 };
  });
  mockProjects.mockReset().mockResolvedValue({
    projects: boundaries[0].data, summary: { active: 1 }, page: 1, pageSize: 20, total: 1,
  });
  mockDsrs.mockReset().mockResolvedValue(boundaries[1].data);
  mockRoles.mockReset().mockResolvedValue(boundaries[2].data);
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

it.each(boundaries)('$path rejects anonymous HTTP requests before account/data lookup', async (boundary) => {
  const response = await request(app).get(boundary.path);
  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({ success: false, error: { statusCode: 401 } });
  expect(mockQuery).not.toHaveBeenCalled();
  expectNoDataAccess();
});

const matrix = boundaries.flatMap((boundary) => roles.flatMap((role) =>
  (['Bearer', 'cookie'] as const).map((credential) => ({ ...boundary, role, credential,
    admitted: (boundary.allowed as readonly string[]).includes(role) })),
));

it.each(matrix)('$path: $role via $credential admitted=$admitted', async (fixture) => {
  const call = request(app).get(fixture.path);
  if (fixture.credential === 'cookie') call.set('Cookie', `admin_session=${token(fixture.role)}`);
  else call.set('Authorization', `Bearer ${token(fixture.role)}`);
  const response = await call;
  expect(response.status).toBe(fixture.admitted ? 200 : 403);
  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery.mock.calls[0]![1]).toEqual([userIds[fixture.role]]);
  if (fixture.admitted) {
    expect(response.body).toMatchObject({ success: true, data: fixture.data });
    expect(fixture.service).toHaveBeenCalledTimes(1);
    for (const boundary of boundaries) {
      if (boundary.service !== fixture.service) expect(boundary.service).not.toHaveBeenCalled();
    }
  } else {
    expect(response.body).toMatchObject({ success: false, error: { statusCode: 403 } });
    expectNoDataAccess();
  }
});

it.each(['malformed', 'expired', 'refresh', 'pre_auth_2fa', 'pre_auth_2fa_setup'])('rejects %s credentials before canonical lookup', async (kind) => {
  const credential = kind === 'malformed' ? 'not-a-jwt'
    : kind === 'expired' ? token('super_admin', {}, -1)
      : token('super_admin', { type: kind });
  const response = await request(app).get('/api/v1/staff/roles').set('Authorization', `Bearer ${credential}`);
  expect(response.status).toBe(401);
  expect(mockQuery).not.toHaveBeenCalled();
  expectNoDataAccess();
});

it.each(['missing', 'inactive', 'changed-role', 'revoked-generation'])('rejects an otherwise valid JWT for a %s account', async (state) => {
  const account = accounts.get(userIds.admin!)!;
  if (state === 'missing') accounts.delete(userIds.admin!);
  else if (state === 'inactive') account.is_active = false;
  else if (state === 'changed-role') account.role = 'customer';
  else account.session_version = 4;
  const response = await request(app).get('/api/v1/admin/projects').set('Cookie', `admin_session=${token('admin')}`);
  expect(response.status).toBe(401);
  expect(response.body.error.code).toBe('session_revoked');
  expectNoDataAccess();
});

it.each([
  { role: 'admin' as const, path: '/api/v1/admin/projects' },
  { role: 'super_admin' as const, path: '/api/v1/staff/roles' },
  { role: 'dpo' as const, path: '/api/v1/admin/compliance/dsr' },
])('$role cannot enter its otherwise permitted route while password rotation is required', async ({ role, path }) => {
  accounts.get(userIds[role]!)!.must_rotate_password = true;
  const response = await request(app).get(path).set('Cookie', `admin_session=${token(role)}`);
  expect(response.status).toBe(428);
  expect(response.body.error.code).toBe('password_rotation_required');
  expectNoDataAccess();
});

it('does not use a super-admin Bearer credential to elevate the selected DPO cookie', async () => {
  const response = await request(app).get('/api/v1/admin/projects')
    .set('Cookie', `admin_session=${token('dpo')}`).set('Authorization', `Bearer ${token('super_admin')}`);
  expect(response.status).toBe(403);
  expect(mockQuery.mock.calls[0]![1]).toEqual([userIds.dpo]);
  expectNoDataAccess();
});

it('fails closed without leaking internal details when canonical account lookup fails', async () => {
  mockQuery.mockRejectedValueOnce(new Error('synthetic-private-account-db-detail'));
  const response = await request(app).get('/api/v1/staff/roles').set('Authorization', `Bearer ${token('super_admin')}`);
  expect(response.status).toBe(500);
  expect(response.text).not.toContain('synthetic-private-account-db-detail');
  expectNoDataAccess();
});

it.todo('Every privileged method/alias/owner/write-CSRF boundary still needs an explicit inventory and behavioral matrix; these three GET routes are only a smoke sample');
