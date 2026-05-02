# Phase C Findings Part 3 — Admin / Staff / Security Services

Files added in this batch:
- `services/admin.service.ts` (520) — admin dashboard KPIs + provider management
- `services/staff.service.ts` (321) — admin role + staff CRUD (D06/Bug 127 fix)
- `services/security.service.ts` (524) — OTP lockout, captcha, device fingerprint, IP blocking, security events

**Phase C running total: ~3,484 lines fully read.**
**Audit grand total: ~17,083 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-55)

### CRIT-56 — Permission system EXISTS in DB but routes don't enforce it
**Files:** [packages/api/src/services/staff.service.ts:306-321](packages/api/src/services/staff.service.ts#L306) (ALL_PERMISSIONS list) + [packages/api/src/middleware/rbac.middleware.ts](packages/api/src/middleware/rbac.middleware.ts) (only checks role string)

The platform has a complete permission system:
- `admin_roles.permissions JSONB` column
- 26 named permissions: `dashboard.view`, `providers.manage`, `financials.view`, `payouts.manage`, `staff.manage`, etc.
- `staff.service.ts:validatePermissions` (line 298-303) validates permissions on role create/update.
- `admin_staff.role_id` ties each staff member to a role.

But the auth chain is:
1. JWT contains `role` ('admin' or 'super_admin' string).
2. `rbac.middleware.ts` only checks if that role string is in the allowed list.
3. **No middleware ever reads `admin_staff.role_id` → `admin_roles.permissions` and checks against the route.**

So a "support" admin (intended permissions: `dashboard.view`, `customers.view`, `support.manage`) can hit `POST /api/v1/admin/payouts/:id/approve` (intended permission: `payouts.manage`) and succeed.

**This is the same bug as CRIT-23 (B04), now confirmed with the schema details.** Critical re-emphasis: the bug isn't that no permission system exists — it's that the system isn't wired to the routes.

**Fix dispatch:**
```
1. Build middleware/permissions.middleware.ts:
   export function requirePermission(permission: string) {
     return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
       if (!req.user) return next(createAppError('Authentication required.', 401));
       if (req.user.role === 'super_admin') return next();  // super_admin bypass
       const result = await db.query<{ permissions: string[] }>(
         `SELECT ar.permissions FROM admin_staff ast
          JOIN admin_roles ar ON ar.id = ast.role_id
          WHERE ast.user_id = $1 AND ast.is_active = TRUE AND ar.deleted_at IS NULL`,
         [req.user.userId]
       );
       const perms = result.rows[0]?.permissions ?? [];
       if (!perms.includes(permission)) {
         return next(createAppError(`Missing permission: ${permission}`, 403));
       }
       next();
     };
   }
2. Apply per-route in admin route files:
   router.post('/payouts/:id/approve', authMiddleware, requirePermission('payouts.manage'), handler);
   router.get('/financials/overview', authMiddleware, requirePermission('financials.view'), handler);
   etc.
3. Cache permission lookups in Redis (TTL 60s) — middleware will fire on every admin request.
4. Test: support staff (perms = ['support.manage']) hits payout approve → 403.
5. Test: super_admin always bypasses.
6. Document: every admin route MUST declare its required permission.
```

### CRIT-57 — Staff member removal has no audit trail (hard DELETE)
**File:** [packages/api/src/services/staff.service.ts:275-296](packages/api/src/services/staff.service.ts#L275)
```ts
await db.query(`DELETE FROM admin_staff WHERE id = $1`, [staffId]);
logger.info('Admin staff removed', { staffId });
```
Hard DELETE. No `admin_actions` audit row. No way to answer "who removed staff member Maria" or "when was Juan removed". Compliance + operational forensics gap.

Also, admin_staff has FK to admin_actions via `admin_id`. If the deleted staff member previously took admin actions, those audit rows now have a dangling FK (or fail to delete the staff if FK is RESTRICT). Need to verify schema.

**Fix dispatch:**
```
1. Soft-delete pattern (mirror staff.service.ts:deleteRole):
   - Add admin_staff.deleted_at, deleted_by, deleted_reason columns (migration).
   - removeStaffMember updates is_active=FALSE + deleted_at + deleted_by inside a transaction.
   - Insert admin_actions row 'admin_staff_removed' with target_id=staffId, reason.
2. listStaff queries should filter is_active=TRUE OR (is_active=FALSE AND deleted_at IS NOT NULL).
3. Test: remove staff → admin_actions row exists with action_type='admin_staff_removed'.
```

### CRIT-58 — getRevenueReport uses string interpolation in SQL
**File:** [packages/api/src/services/admin.service.ts:380-402](packages/api/src/services/admin.service.ts#L380)
```ts
const truncUnit = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';
const result = await db.query<RevenueRow>(
  `SELECT date_trunc('${truncUnit}', wt.created_at)::date::text AS date, ...`,
  [days],
);
```
TypeScript signature restricts `period` to `'daily' | 'weekly' | 'monthly'` and the ternary maps to safe constants ('day' / 'week' / 'month'). Currently safe.

**But the pattern is dangerous.** A future refactor that loosens the type or accepts user input could introduce SQL injection via `truncUnit`. Same pattern in financial-admin etc. Best practice: hard-code three separate queries (one per period) OR use a Postgres function. String-interpolating column/function names into SQL is a pitfall.

**Fix dispatch:**
```
1. Replace string interpolation with explicit branching:
   const queryByPeriod: Record<string, string> = {
     daily: `SELECT date_trunc('day', ...) ...`,
     weekly: `SELECT date_trunc('week', ...) ...`,
     monthly: `SELECT date_trunc('month', ...) ...`,
   };
   const sql = queryByPeriod[period];
   if (!sql) throw createAppError('Invalid period', 400);
   await db.query<RevenueRow>(sql, [days]);
2. Audit other services for similar patterns (Grep "date_trunc.*\${").
3. Add lint rule banning template literals containing date_trunc with interpolated values.
```

---

## MEDIUM bugs

### MED-84 — admin.service.ts active bookings count uses inconsistent status set
**File:** [packages/api/src/services/admin.service.ts:95-97](packages/api/src/services/admin.service.ts#L95)
```sql
NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin', 'paid_out', 'confirmed', 'resolved')
```
So `'completed_by_provider'`, `'payout_ready'` are counted as "active". Consistent with what booking.service:listBookings calls ACTIVE, but inconsistent with financial-admin (which counts completed_by_provider in GMV). **Same root cause as MED-55 in B09.** Fix as part of the centralized status-group constants.

### MED-85 — Admin actions on providers (suspend/reactivate/changeTier) don't notify the provider
**Files:** 
- [packages/api/src/services/admin.service.ts:233-249](packages/api/src/services/admin.service.ts#L233) (suspendProvider)
- [packages/api/src/services/admin.service.ts:251-267](packages/api/src/services/admin.service.ts#L251) (reactivateProvider)
- [packages/api/src/services/admin.service.ts:269-294](packages/api/src/services/admin.service.ts#L269) (changeProviderTier)

Provider gets suspended → doesn't know until they try to accept a job and get an error. Tier changes affect commission rate (money). Provider should be notified.

`approveProvider` and `rejectProvider` DO notify (line 191-197, 219-227). Suspend/reactivate/changeTier don't. Inconsistent.

**Fix:** add notifications INSERT in same transaction for each.

### MED-86 — changeProviderTier reads oldTier OUTSIDE transaction (race)
**File:** [packages/api/src/services/admin.service.ts:269-294](packages/api/src/services/admin.service.ts#L269)
```ts
const current = await db.query<TierRow>(`SELECT tier FROM providers WHERE id = $1`, [providerId]);
// ... gap ...
await db.transaction(async (client) => {
  await client.query(`UPDATE providers SET tier = $1 ... WHERE id = $2`, ...);
  await client.query(`INSERT INTO admin_actions ... details: oldTier, newTier ...`, ...);
});
```
The `oldTier` captured before the transaction may be stale. If two admins change tier simultaneously, audit rows have wrong oldTier values. Move the SELECT inside the transaction with `FOR UPDATE`.

### MED-87 — getAdminActions uses dynamic import inside function
**File:** [packages/api/src/services/admin.service.ts:438](packages/api/src/services/admin.service.ts#L438)
```ts
const { maskPiiForRole } = await import('../utils/pii-mask');
```
Dynamic import for module loading is fine but unnecessary here — the module is small and used per-call. Convert to top-level static import for clarity and to avoid dynamic-import bundler complications.

### MED-88 — listBookingsAdmin search uses ILIKE on UUID cast (slow)
**File:** [packages/api/src/services/admin.service.ts:347-350](packages/api/src/services/admin.service.ts#L347)
`b.id::text ILIKE '%search%'` cannot use the UUID index. Full-table scan on each search. At 100k bookings, this is slow.

**Fix:** require search to be a UUID prefix (≥8 chars), match on `b.id::text LIKE 'prefix%'` (anchored prefix can use index). OR add a separate text-search column / index.

### MED-89 — security.service.ts isIpBlocked has no caching
**File:** [packages/api/src/services/security.service.ts:265-274](packages/api/src/services/security.service.ts#L265)
Called on EVERY request via `ip-block.middleware.ts`. DB query per request. Cache in Redis with short TTL (e.g., 60s) — most blocked IPs stay blocked for hours.

### MED-90 — security.service.ts detectSuspiciousIps misses distributed credential-stuffing attacks
**File:** [packages/api/src/services/security.service.ts:426-456](packages/api/src/services/security.service.ts#L426)
Aggregates by single IP. 10 IPs each with 9 failures = none blocked. Should also detect:
- IPs that touched ≥5 distinct phones in 1 hour (likely credential stuffing).
- IPs failing across many phone country codes (rare for legit users in a single-country app).

### MED-91 — Auto-blocked IPs expire after 24h with no escalation
**File:** [packages/api/src/services/security.service.ts:445](packages/api/src/services/security.service.ts#L445)
`expiresInHours: 24`. Attacker waits 24h, comes back. No tracking of repeat-offender IPs. Add escalation: 1st block 24h, 2nd block 7d, 3rd permanent.

### MED-92 — Cloudflare Turnstile verify has no timeout
**File:** [packages/api/src/services/security.service.ts:160-165](packages/api/src/services/security.service.ts#L160)
Same pattern as hCaptcha (MED-67 in C01). Add AbortController.

### MED-93 — staff.service.ts updateStaffMember has no audit trail
**File:** [packages/api/src/services/staff.service.ts:248-273](packages/api/src/services/staff.service.ts#L248)
Role changes (line 256-259) are MONEY-RELEVANT — different role = different perms = different actions a staff can take. No audit row.

**Fix:** Wrap in transaction, write admin_actions row 'admin_staff_role_changed' with details `{oldRoleId, newRoleId}` (read oldRoleId via FOR UPDATE inside the transaction).

### MED-94 — security.service.ts logSecurityEvent fire-and-forget
**File:** [packages/api/src/services/security.service.ts:360-378](packages/api/src/services/security.service.ts#L360)
Single INSERT. No error handling. If DB hiccup, security event lost. For OTP lockout / new device detection, the event IS the audit. Add try/catch with logger.warn fallback (preserve at least the structured log).

---

## LOW / INFO

- **staff.service.ts:deleteRole is a model implementation** of soft-delete + audit + transaction (D06/Bug 127). Other write operations should follow this pattern.
- **admin.service.ts dashboard KPIs** are consolidated into single SQL. Good perf.
- **security.service.ts OTP lockout uses both phone + IP counters** — defense against single-vector and distributed attacks.
- **device fingerprint registration** logs `new_device_login` security event when count > 1 — good for detecting account takeover.
- **PII masking applied in getAdminActions** (line 438-440) per D08/Bug 66 etc. Role-aware.

---

## Cross-cutting summary update

The CRIT-23 → CRIT-56 finding (RBAC enforcement gap) is now **fully understood**:
- Permission schema: ✅ exists (admin_roles.permissions JSONB)
- Staff-to-role mapping: ✅ exists (admin_staff.role_id)
- 26-permission allowlist: ✅ defined (staff.service.ts:ALL_PERMISSIONS)
- Permission validation on role mgmt: ✅ enforced (staff.service.ts:validatePermissions)
- Permission enforcement on admin routes: ❌ **MISSING — every admin route is super_admin-equivalent**

The fix is mechanical: build `requirePermission(perm)` middleware (CRIT-56 dispatch), apply to every admin route. It's a high-ceremony rollout (apply per-endpoint, decide which permission each needs) but low risk.

---

## What's still ahead in Phase C

- `routes/auth.routes.ts` (977)
- `routes/admin.routes.ts` (1,614 — split read)

Subtotal still to read: ~2,591 lines.
