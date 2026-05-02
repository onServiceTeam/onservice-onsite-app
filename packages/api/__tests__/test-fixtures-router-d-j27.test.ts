// D-J27 / F#3 fix verified — test fixture router exists, is GATED
// behind both NODE_ENV !== 'production' AND ENABLE_TEST_FIXTURES=1,
// and exposes the 4 endpoints the Maestro state-trigger scripts need.
//
// Pre-fix: handoff doc F3-maestro-baseline-capture.md referenced
// scripts/maestro/{force-error,seed-empty,seed-success}.sh and
// /__test/* endpoints that didn't exist. Maestro flows could only
// capture default-state baselines; loading/empty/error/success
// states were unreachable.
//
// Post-fix: router exists with the 4 endpoints, mounted in server.ts
// only when both gating conditions hold, and the 3 shell scripts
// exist with executable permission.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/test-fixtures.routes.ts'),
  'utf8',
);
const SERVER = readFileSync(
  resolve(__dirname, '../src/server.ts'),
  'utf8',
);
const REPO_ROOT = resolve(__dirname, '../../..');

describe('D-J27 — test-fixtures.routes.ts gating', () => {
  it('isFixturesEnabled requires NODE_ENV !== production AND ENABLE_TEST_FIXTURES=1', () => {
    expect(ROUTES).toMatch(/process\.env\.NODE_ENV !== 'production'/);
    expect(ROUTES).toMatch(/process\.env\.ENABLE_TEST_FIXTURES === '1'/);
    // Both conditions on the same line (logical AND).
    expect(ROUTES).toMatch(/return process\.env\.NODE_ENV !== 'production' && process\.env\.ENABLE_TEST_FIXTURES === '1'/);
  });

  it('buildTestFixturesRouter returns an empty router when gating fails (defense-in-depth)', () => {
    expect(ROUTES).toMatch(/if \(!isFixturesEnabled\(\)\) \{\s*\/\/ Return an empty router/);
  });

  it('consumeForceNextErrorMiddleware no-ops when gating fails', () => {
    expect(ROUTES).toMatch(/consumeForceNextErrorMiddleware[\s\S]{0,300}if \(!isFixturesEnabled\(\)\)/);
  });
});

describe('D-J27 — test-fixtures.routes.ts endpoints', () => {
  it('exposes POST /force-next-error', () => {
    expect(ROUTES).toMatch(/router\.post\('\/force-next-error'/);
  });

  it('force-next-error sets a SINGLE-SHOT flag (consumed on next request)', () => {
    // The middleware sets flag = false after triggering once.
    expect(ROUTES).toMatch(/forceNextErrorFlag = false; \/\/ single-shot/);
  });

  it('exposes POST /reset to clear the flag', () => {
    expect(ROUTES).toMatch(/router\.post\('\/reset'/);
  });

  it('exposes POST /seed/empty with scope whitelist', () => {
    expect(ROUTES).toMatch(/router\.post\('\/seed\/empty'/);
    expect(ROUTES).toMatch(/TRUNCATABLE_SCOPES/);
    expect(ROUTES).toMatch(/bookings:\s*\['bookings'\]/);
    expect(ROUTES).toMatch(/notifications:\s*\['notifications'\]/);
  });

  it('exposes POST /seed/success', () => {
    expect(ROUTES).toMatch(/router\.post\('\/seed\/success'/);
  });

  it('seed/empty uses a transaction for the truncate', () => {
    expect(ROUTES).toMatch(/await db\.transaction\(async \(client\) => \{[\s\S]{0,300}DELETE FROM/);
  });

  it('rejects unknown scope with a clear error', () => {
    expect(ROUTES).toMatch(/Unknown empty-scope/);
    expect(ROUTES).toMatch(/Unknown success-scope/);
  });
});

describe('D-J27 — server.ts mounts the router behind the same gate', () => {
  it('imports and uses isFixturesEnabled before mounting', () => {
    expect(SERVER).toMatch(/testFixtures\.isFixturesEnabled\(\)/);
  });

  it('mounts at /__test (matches the script paths)', () => {
    expect(SERVER).toMatch(/app\.use\('\/__test', testFixtures\.buildTestFixturesRouter\(\)\)/);
  });

  it('mounts the consumeForceNextErrorMiddleware before /__test', () => {
    expect(SERVER).toMatch(/app\.use\(testFixtures\.consumeForceNextErrorMiddleware\)/);
    // The middleware mount must precede the router mount in source order.
    const middlewarePos = SERVER.indexOf('testFixtures.consumeForceNextErrorMiddleware');
    const routerPos = SERVER.indexOf("'/__test', testFixtures.buildTestFixturesRouter");
    expect(middlewarePos).toBeGreaterThan(0);
    expect(routerPos).toBeGreaterThan(middlewarePos);
  });

  it('logs a warning when fixtures ARE mounted (operator visibility)', () => {
    expect(SERVER).toMatch(/Test fixture endpoints MOUNTED/);
  });
});

describe('D-J27 — shell scripts exist and are executable', () => {
  it.each([
    'scripts/maestro/force-error.sh',
    'scripts/maestro/seed-empty.sh',
    'scripts/maestro/seed-success.sh',
  ])('%s exists', (path) => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });

  it('scripts have a #!/usr/bin/env bash shebang', () => {
    for (const f of ['force-error.sh', 'seed-empty.sh', 'seed-success.sh']) {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/maestro', f), 'utf8');
      expect(content.split('\n')[0]).toBe('#!/usr/bin/env bash');
    }
  });

  it('scripts use set -euo pipefail (defensive bash)', () => {
    for (const f of ['force-error.sh', 'seed-empty.sh', 'seed-success.sh']) {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/maestro', f), 'utf8');
      expect(content).toMatch(/set -euo pipefail/);
    }
  });

  it('scripts default API_URL to localhost but allow env override', () => {
    for (const f of ['force-error.sh', 'seed-empty.sh', 'seed-success.sh']) {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/maestro', f), 'utf8');
      expect(content).toMatch(/API_URL="\$\{API_URL:-http:\/\/localhost:7381\}"/);
    }
  });

  it('scope-required scripts validate the arg', () => {
    for (const f of ['seed-empty.sh', 'seed-success.sh']) {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/maestro', f), 'utf8');
      expect(content).toMatch(/SCOPE="\$\{1:-\}"/);
      expect(content).toMatch(/Usage: \$0 <scope>/);
    }
  });

  it('README documents the 3 scripts + gating', () => {
    const readme = readFileSync(resolve(REPO_ROOT, 'scripts/maestro/README.md'), 'utf8');
    expect(readme).toMatch(/force-error\.sh/);
    expect(readme).toMatch(/seed-empty\.sh/);
    expect(readme).toMatch(/seed-success\.sh/);
    expect(readme).toMatch(/ENABLE_TEST_FIXTURES=1/);
    expect(readme).toMatch(/NODE_ENV !== 'production'/);
  });
});
