# Phase N Batch 1 — admin.routes.ts (1 file, 1,614 lines)

## File fully read
- packages/api/src/routes/admin.routes.ts (1614)

## Findings

### CRIT-N01 — Most provider mutation endpoints accept 'admin' role; junior admins can approve/suspend/tier providers
**Where found:** packages/api/src/routes/admin.routes.ts:23-27 + 167-252
```ts
function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}
```
The function name `requireAdmin` accepts **BOTH** 'admin' and 'super_admin'. Routes using it:
- PUT /providers/:id/approve (line 167) — junior admin can approve a provider with no senior review.
- PUT /providers/:id/reject (line 184) — junior admin can reject.
- PUT /providers/:id/suspend (line 202) — junior admin can suspend.
- PUT /providers/:id/reactivate (line 220) — junior admin can reactivate (compromised admin can resurrect a banned provider).
- PUT /providers/:id/tier (line 237) — junior admin can change tier (which directly changes commission rate).
- POST /invoices/:id/mark-paid (line 738) — junior admin can mark a B2B invoice paid (no payment actually flowed; operator forgery).
- POST /service-areas (line 806) — create new service area.
- PATCH /service-areas/:id (line 854) — modify (including status).
- POST /service-areas/:id/activate (line 873) — go-live a new market.
- POST /service-areas/:id/providers (line 932) — assign providers to areas (changes matching).
- DELETE /service-areas/:areaId/providers/:providerId (line 953) — unassign.
- POST /blocked-ips (line 1234) — block any IP.
- POST /blocked-ips DELETE (line 1265) — unblock.
- POST /analytics/ab-tests (line 1349) — create AB test affecting all users.
- POST /analytics/quality-scores/compute (line 1483) — recompute provider rankings.

**Confirms F03 audit CRITs (CRIT-130/131/137/142/144/147/148/etc.) at the source.** This file is the operational root.

**Fix:** For each mutation endpoint, decide: junior admin OR super_admin. The Phase I-B P0-2 dispatch (Phase F's recommendation) covers this — replace `requireAdmin` with per-action `requireSuperAdmin` calls for the truly high-stakes operations (provider tier change, invoice mark-paid, service-area activation, IP block management). For listing/read endpoints, junior admin is fine.

### CRIT-N02 — GET /admin/audit-log returns raw IP/user_agent regardless of viewer role; bypasses Bug 66 PII masking
**Where found:** packages/api/src/routes/admin.routes.ts:1574-1599
```ts
data: dataResult.rows.map((r) => ({
  ...
  ipAddress: r.ip_address,         // ← raw, no role-based masking
  userAgent: r.user_agent,         // ← raw, no role-based masking
  ...
}))
```
**Understood:** The /actions endpoint at line 377 correctly passes `req.user!.role` to `getAdminActions` for PII masking (Bug 66 fix). But the /audit-log endpoint at line 1531 doesn't apply maskPiiForRole. Junior admin (or any non-super_admin role) viewing the audit log sees raw client IPs and user agents for every request. NPC RA 10173 §28 violation — least-privilege exposure of PII broken for one of the most-viewed admin pages.

**Why it matters:** F04 audit found role-aware PII masking exists. This route bypasses it. Customer IPs from booking/cancellation flows leak to support agents. PII masking implementation effectively wasted because most reads of the data table happen via this endpoint.

**Fix:** Wrap the `dataResult.rows.map()` body to call `maskPiiForRole(row, req.user!.role)` before returning. Test with non-super_admin role to confirm masking applies.

### MED-N01 — Manual ad-hoc validation in many routes instead of validationMiddleware/Zod
**Where found (sampling):**
- /business-accounts/:id/set-discount lines 690-718 — manual `typeof volumeDiscountRate !== 'number' || volumeDiscountRate < 0 || volumeDiscountRate > 50`
- /service-areas/:id/providers line 938-942 — manual `if (!providerId) ... 400`
- /blocked-ips line 1239-1247 — manual typeof checks
- /analytics/ab-tests line 1355 — manual `if (!name || typeof name !== 'string')`
- /analytics/ab-tests/:testId/status line 1400-1403 — manual enum check

**Understood:** Other routes (provider mutations) properly use `validationMiddleware(zodSchema)`. The drift is significant: each manually-validated route has a different error format ("error.message" vs "{success, message}"), different error codes, and different bounds.

**Fix:** Migrate all manual validation to Zod schemas in validators/. Each new endpoint should require a schema before merge.

### MED-N02 — /actions endpoint passes role for PII masking but service trusts unfiltered status from query
**Where found:** packages/api/src/routes/admin.routes.ts:374-379
```ts
const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : undefined;
const actionType = typeof req.query.actionType === 'string' ? req.query.actionType : undefined;
```
**Understood:** Filter parameters pass through directly. `adminId` is presumably used as a SQL filter — if adminService.getAdminActions does parameterized SQL (likely from Phase B audit it does), this is safe. But there's no validation that adminId is a UUID. Garbage values would either return empty results or hit unparseable-UUID errors.
**Fix:** Validate adminId as UUID, validate actionType against the enum. Push validation to the route.

### MED-N03 — Recurring booking listing inline SQL (line 416-420)
**Where found:** packages/api/src/routes/admin.routes.ts:416-420
```ts
searchClause = `AND (u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR rb.city ILIKE $${paramIdx} OR rb.province ILIKE $${paramIdx})`;
params.push(`%${search}%`);
```
**Understood:** SQL is constructed in a route handler instead of a service. This is parameterized so SQL-safe, but business logic in routes is harder to test. Pattern repeats in /business-accounts (line 529-533).
**Fix:** Move to adminService.listRecurringBookings(...) and adminService.listBusinessAccounts(...). Routes should be thin transport.

### POSITIVE — release-escrow uses requireSuperAdmin
- Line 307: POST /bookings/:id/release-escrow correctly uses `requireSuperAdmin`. Reason min 10 chars. Audit log row inserted.

### POSITIVE — /actions uses requireSuperAdmin AND passes role for masking
- Line 371-380: super_admin only AND maskPiiForRole at service layer.

### POSITIVE — Pricing rules + service areas use Zod validation
- POST /service-areas (line 806) wraps `validationMiddleware(createServiceAreaSchema)`.
- POST /pricing-rules (line 1056) wraps `validationMiddleware(createPricingRuleSchema)`.

### POSITIVE — Admin Action audit row written for manual escrow release
- Line 332-338 — admin_actions row with action_type='manual_escrow_release', target_id=booking, details=JSON breakdown.

## Cumulative Phase N progress: 1 / 104 files (~1,614 lines)
