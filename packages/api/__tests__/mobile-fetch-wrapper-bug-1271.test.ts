// Bug 1271 fix verified — mobile half.
// Phase 14 Dispatch 02 Part 5.
//
// Asserts the mobile axios → fetch conversion is complete: no axios imports
// in apps/mobile, the new wrapper preserves the axios-style envelope, and
// the gate scope is constrained to client code.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../');

describe('Bug 1271 fix verified (mobile) — no axios anywhere under apps/mobile', () => {
  it('apps/mobile/package.json has no axios dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/package.json'),
      'utf8',
    )) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(pkg.dependencies?.axios).toBeUndefined();
    expect(pkg.devDependencies?.axios).toBeUndefined();
  });

  it('no axios imports in apps/mobile/{app,src}', () => {
    function* walk(dir: string): Generator<string> {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          yield* walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          yield full;
        }
      }
    }
    const offenders: string[] = [];
    for (const dir of ['apps/mobile/app', 'apps/mobile/src']) {
      const root = path.join(REPO_ROOT, dir);
      if (!fs.existsSync(root)) continue;
      for (const file of walk(root)) {
        const src = fs.readFileSync(file, 'utf8');
        if (/import\s+(?:[^'"]+\s+from\s+)?['"]axios['"]/.test(src)) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Bug 1271 fix verified (mobile) — fetch wrapper structural assertions', () => {
  it('apps/mobile/src/services/api.ts uses native fetch with the axios-style envelope', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/src/services/api.ts'),
      'utf8',
    );
    expect(file).not.toMatch(/import\s+axios/);
    expect(file).toMatch(/await fetch\(/);
    // Returns the axios-shaped envelope so callsites can keep using res.data.data.
    expect(file).toMatch(/return\s*\{\s*data:/);
    // Refresh-on-401 behavior preserved.
    expect(file).toMatch(/refreshOnce|\/auth\/refresh-token/);
    // Bearer token sourced from secure-storage.
    expect(file).toMatch(/getAccessToken/);
  });

  it('apps/mobile/src/services/config.service.ts uses native fetch (no axios)', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/src/services/config.service.ts'),
      'utf8',
    );
    expect(file).not.toMatch(/import\s+axios/);
    expect(file).toMatch(/await fetch\(/);
  });
});

describe('Bug 1271 fix verified (mobile) — gate scope', () => {
  it('a-cross-source-no-axios.sh scans apps/ only (server-side outbound is out of scope)', () => {
    const gate = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/gates/a-cross-source-no-axios.sh'),
      'utf8',
    );
    expect(gate).toMatch(/grep -rE[\s\S]*apps\//);
    // Scope constraint is documented in the gate file.
    expect(gate).toMatch(/server-?to-?server|server-side outbound/i);
  });
});
