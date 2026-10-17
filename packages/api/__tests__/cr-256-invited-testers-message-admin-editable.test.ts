// CR-256 (customer review 2026-10-17, slice P2; D41 Q47; standing rule 9):
// the invited-testers words and switch are admin-editable. A super admin
// saves new words through the real admin settings route, and the next
// refused number sees them; words that are empty, too long or not plain text
// are refused; the switch itself is a live, editable control. Real admin
// settings router and auth router on the guarded PostgreSQL fixture.
import { p2Http, p2It as it, superAdminUser, withP2Database } from './helpers/p2-switches-postgres';
import authRouter from '../src/routes/auth.routes';
import settingsRouter from '../src/routes/settings.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const superAdmin = { userId: superAdminUser, role: 'super_admin' };
const savedAllow = process.env.ALLOW_DEV_OTP;
afterEach(() => {
  if (savedAllow === undefined) delete process.env.ALLOW_DEV_OTP;
  else process.env.ALLOW_DEV_OTP = savedAllow;
});

it('Bug CR-256 — a super admin can change the invited-testers message and the refused number sees the new words', async () => {
  await withP2Database(async database => {
    delete process.env.ALLOW_DEV_OTP;
    const http = p2Http([['/api/v1/auth', authRouter], ['/api/v1/admin/settings', settingsRouter]]);
    const version = async (): Promise<string> => (await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM platform_settings WHERE key = 'invited_testers_message'",
    )).rows[0]!.updated_at.toISOString();

    const listing = await http.get('/api/v1/admin/settings', superAdmin);
    expect(listing.status).toBe(200);
    const auth = listing.body.data.settings.auth as Array<Record<string, unknown>>;
    expect(auth.filter((row) => String(row.key).startsWith('invited_testers')).map((row) => ({
      key: row.key, value: row.value, editable: row.editable, runtimeStatus: row.runtimeStatus,
    }))).toEqual([
      { key: 'invited_testers_only', value: 'true', editable: true, runtimeStatus: 'live' },
      { key: 'invited_testers_message', value: 'onService is open to invited testers for now.', editable: true, runtimeStatus: 'live' },
    ]);

    const words = 'Sign-up is by invitation for now. Ask the onService team for an invite.';
    const saved = await http.put('/api/v1/admin/settings/invited_testers_message', {
      value: words, reason: 'Clearer words for people who are not invited yet.', expectedUpdatedAt: await version(),
    }, superAdmin);
    expect(saved.status).toBe(200);
    expect(saved.body.data.value).toBe(words);

    const refused = await http.post('/api/v1/auth/send-otp', { phone: '+639171112233' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toBe(words);

    for (const bad of ['', 'x'.repeat(201), 'Join us at <a href="https://example.invalid">this link</a>']) {
      const rejected = await http.put('/api/v1/admin/settings/invited_testers_message', {
        value: bad, reason: 'Trying words the server should refuse.', expectedUpdatedAt: await version(),
      }, superAdmin);
      expect({ length: bad.length, status: rejected.status }).toEqual({ length: bad.length, status: 400 });
    }
    expect((await database.query("SELECT value FROM platform_settings WHERE key = 'invited_testers_message'")).rows[0].value)
      .toBe(words);
  });
}, 90000);
