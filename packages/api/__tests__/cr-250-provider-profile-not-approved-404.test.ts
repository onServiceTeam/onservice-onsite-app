// CR-250 (customer review 2026-10-17, slice P2, discovery-support-4):
// Service Provider profile privacy fix. A customer opening a profile gets it
// only for an approved Service Provider with an active account. Pending,
// rejected, suspended and deactivated Service Providers, an inactive account,
// an unknown id and a malformed id all get the same 404, with no profile
// field in the body. Real provider router, real authentication middleware,
// real SQL on the guarded PostgreSQL fixture.
import {
  approvedProvider, customerUser, deactivatedProvider, inactiveAccountProvider, p2Http, p2It as it,
  pendingProvider, rejectedProvider, suspendedProvider, withP2Database,
} from './helpers/p2-switches-postgres';
import providerRouter from '../src/routes/provider.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const customer = { userId: customerUser, role: 'customer' };

it('Bug CR-250 — a Service Provider profile that is not approved, or whose account is inactive, is a plain 404', async () => {
  await withP2Database(async () => {
    const http = p2Http([['/api/v1/providers', providerRouter]]);

    // The approved one is found, so the 404s below are about status, not the fixture.
    const approved = await http.get(`/api/v1/providers/${approvedProvider}`, customer);
    expect(approved.status).toBe(200);

    const hidden = {
      pending: pendingProvider,
      rejected: rejectedProvider,
      suspended: suspendedProvider,
      deactivated: deactivatedProvider,
      inactiveAccount: inactiveAccountProvider,
      unknown: 'c3000000-0000-4000-8000-0000000000ff',
      malformed: 'not-a-provider-id',
    };
    const answers: Record<string, unknown> = {};
    for (const [label, id] of Object.entries(hidden)) {
      const response = await http.get(`/api/v1/providers/${id}`, customer);
      answers[label] = { status: response.status, body: response.body };
    }
    const notFound = {
      status: 404,
      body: { success: false, error: { message: 'Service Provider not found.', statusCode: 404 } },
    };
    expect(answers).toEqual({
      pending: notFound,
      rejected: notFound,
      suspended: notFound,
      deactivated: notFound,
      inactiveAccount: notFound,
      unknown: notFound,
      malformed: notFound,
    });
  });
}, 90000);
