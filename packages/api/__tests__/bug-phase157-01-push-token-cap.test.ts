// BUG-PHASE157-01 — POST /api/v1/notifications/push-token accepted
// `token` with no length cap. push_tokens.token is a TEXT column
// (migration 016) with no DB-side bound. Real push tokens are
// well-bounded (APNs 64, FCM 150-200, Expo 50-80), but the route
// would accept megabytes.
//
// Same defense-in-depth pattern as Phase 152-156. Cap at 256
// (generous enough for any real provider, tight enough to reject
// junk).
//
// Test strategy: source-content regression on the route file.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/notification.routes.ts'),
  'utf8',
);

describe('BUG-PHASE157-01 — push token cap', () => {
  it('declares PUSH_TOKEN_MAX = 256', () => {
    expect(SOURCE).toMatch(/const PUSH_TOKEN_MAX = 256/);
  });

  it('rejects token > 256 chars', () => {
    expect(SOURCE).toMatch(
      /token\.length > PUSH_TOKEN_MAX[\s\S]+?Push token must be ≤ \$\{PUSH_TOKEN_MAX\} characters/,
    );
  });

  it('PHASE157 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE157-01 fix/);
  });
});
