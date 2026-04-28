# Gate 2 — Paper Trace (Phase 12)

## Force-enrolment flow

### 1. Admin login (existing-admin-without-2FA)
1. `POST /api/v1/auth/admin/login` body `{ email, password }`.
2. `securityService.recordLoginAttempt(...)` increments per-IP counter (existing).
3. SELECT user row. Verify password (bcrypt).
4. `SELECT totp_enabled FROM users WHERE id = $1`.
5. Branch:
   - `totp_enabled=true` → existing `pre_auth_2fa` flow (unchanged).
   - `totp_enabled=false AND role IN ('admin','super_admin')` → sign 5-min `pre_auth_2fa_setup` token. Return `{ requires2FASetup: true, preAuthToken, userId }`.
   - else → mint full session.
6. `recordLoginAttempt(eventType: 'admin_login_2fa_setup_required')` (or appropriate audit string).

### 2. Setup call
1. Client `POST /api/v1/auth/admin/2fa/setup` `Authorization: Bearer <preAuthToken>`.
2. `adminAuthOrSetupToken` middleware verifies the JWT:
   - If `type === 'pre_auth_2fa_setup'`, set `req.user = { userId, role: 'admin' }` and `req.isSetupToken = true`.
   - If standard admin access JWT, normal flow.
3. Handler generates secret + URI, stores secret encrypted in `users.totp_secret`, returns `{ secret, uri }`.

### 3. Enable call
1. Client `POST /api/v1/auth/admin/2fa/enable` `Authorization: Bearer <preAuthToken>` body `{ totpCode }`.
2. Same middleware accepts the setup token.
3. Handler: verify TOTP against the stored secret; on success, `UPDATE users SET totp_enabled = TRUE WHERE id = $1`.
4. If `req.isSetupToken === true`, mint full `accessToken + refreshToken + user` and return them in the response body. Frontend stores tokens; user is now logged in with 2FA active.
5. Insert `audit_log` action='admin_2fa_enrolled' (try/catch + warn).

## Smoke test paths

Each smoke test runs in <100ms and asserts an invariant that, if broken, would block deploy:
- `health endpoint`: route exists.
- `auth.login validator`: well-formed payload accepted.
- `money conservation`: synthetic 100-row sample sums match.
- `booking state machine`: happy path allowed; pending←completed rejected.
- `commission calculator`: fixed input → fixed output BIGINT centavos string.
- `TOTP utility`: deterministic seed at fixed time → known 6-digit code.
- `audit CSV escape`: commas + quotes RFC 4180 compliant.

## Money paths
NONE modified. The smoke test ASSERTS money conservation on a synthetic ledger sample but does not change any production money math.

## Idempotency
- Re-calling `/admin/2fa/setup` with the setup token regenerates the secret (overwrites) before enable. After `/enable` succeeds, the setup token is unusable for further setup because `totp_enabled=true` would force the regular `pre_auth_2fa` branch on next login.
- `/enable` is single-use semantically (subsequent calls verify but do not re-mint). The frontend transitions to the dashboard on success.
