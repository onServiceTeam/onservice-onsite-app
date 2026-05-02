# Phase C Findings Part 5 — admin.routes.ts (1,614 lines)

**Phase C running total: ~6,075 lines fully read. PHASE C COMPLETE.**
**Audit grand total: ~19,674 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-62)

### CRIT-63 — /audit-log endpoint returns RAW PII (email, IP, user-agent) to any admin
**File:** [packages/api/src/routes/admin.routes.ts:1531-1606](packages/api/src/routes/admin.routes.ts#L1531)
```ts
const dataResult = await db.query<AuditLogRow>(
  `SELECT al.*, u.email AS user_email, u.role AS user_role
   FROM audit_log al
   LEFT JOIN users u ON u.id = al.user_id
   ${whereClause}
   ORDER BY al.created_at DESC
   LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
  ...
);
res.json({
  success: true,
  data: dataResult.rows.map((r) => ({
    ...
    userEmail: r.user_email,
    ipAddress: r.ip_address,    // ← RAW IP
    userAgent: r.user_agent,    // ← RAW UA
    ...
  })),
});
```
- Joins audit_log with users to expose customer email + role.
- Returns raw `ip_address` and `user_agent` to ANY admin (just `requireAdmin`).
- **No PII masking via `maskPiiForRole`.** Directly contradicts the D08/Bug 66 pattern that `getAdminActions` (admin.service.ts:404-443) correctly applies.

Support / dispatcher / finance staff with `role='admin'` can:
- Read the audit log.
- See every customer's email, IP address, browser fingerprint, and role.
- Use this for stalking, doxxing, or selling to third parties.

This is a **direct NPC RA 10173 §21 violation** for an endpoint that's already in production.

**Fix dispatch:**
```
1. Apply role-aware PII masking before returning:
   const { maskPiiForRole } = await import('../utils/pii-mask');
   const masked = dataResult.rows.map((row) => maskPiiForRole({
     ip_address: row.ip_address,
     user_agent: row.user_agent,
     email: row.user_email,
     details: row.new_values as Record<string, unknown> | null,
   }, req.user!.role));
2. Replace ip_address/user_agent/user_email in the response with masked values.
3. Add a "Reveal PII" sub-endpoint for super_admin only:
   POST /admin/audit-log/:id/reveal-pii { reason } → returns raw PII, audit logs the reveal as 'pii_reveal' action.
4. Restrict /audit-log to super_admin OR DPO via requireDpoRole middleware (or new permission audit.view-pii).
5. Test: support admin queries /audit-log → response shows '+63 9XX XXX 1234' format, NOT raw phones.
```

### CRIT-64 — /admin/bookings/:id/release-escrow uses legacy non-transactional pattern (DUPLICATE of booking-admin.service.ts route)
**File:** [packages/api/src/routes/admin.routes.ts:302-347](packages/api/src/routes/admin.routes.ts#L302)
```ts
const breakdown = await escrowService.releaseEscrow(id);
await db.query(
  `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
   VALUES ($1, 'manual_escrow_release', 'booking', $2, $3, $4)`,
  ...
);
```
This route exists IN ADDITION to `booking-admin.service.ts:manualReleaseEscrow` (which `booking-admin.routes.ts` exposes). The booking-admin version was correctly migrated to D06 transaction-aware pattern (B09: `releaseEscrowInTransaction` + audit in same tx). **This admin.routes.ts version was NOT migrated.**

So depending on which admin URL is called:
- `/api/v1/admin/bookings/:id/release-escrow` → buggy non-transactional (this file)
- `/api/v1/admin/bookings/:id/release-escrow` → correct transactional (booking-admin.routes.ts)

Wait — same path. The mount order in server.ts:194 mounts `bookingAdminRoutes` BEFORE `adminRoutes` (line 209), so the booking-admin version wins. **This file's handler may be dead code.**

**Verify and remove:**
```
1. Grep for `/release-escrow` in route files. Confirm the booking-admin.routes.ts version is the live handler.
2. If admin.routes.ts:302-347 is dead code, REMOVE it. Don't leave both copies — future maintainer might unmount booking-admin and re-expose the broken path.
3. If both are reachable (different paths), migrate this one to the D06 pattern.
4. Test: trace request to /api/v1/admin/bookings/<id>/release-escrow, confirm which handler runs.
```

### CRIT-65 — Business account suspend/discount/manager updates have no audit + no notification
**Files:** 
- [packages/api/src/routes/admin.routes.ts:625-650](packages/api/src/routes/admin.routes.ts#L625) (suspend)
- [packages/api/src/routes/admin.routes.ts:652-681](packages/api/src/routes/admin.routes.ts#L652) (assign-manager)
- [packages/api/src/routes/admin.routes.ts:683-735](packages/api/src/routes/admin.routes.ts#L683) (set-discount)

For B2B accounts:
- **Suspend** (an account-killing action): no audit row, no notification to owner.
- **Assign-manager** (changes who handles the account): no audit row.
- **Set-discount** (changes pricing — money-relevant!): no audit row, no notification.

For business contracts that have committed monthly volume and pre-negotiated pricing, silently changing the discount rate from 5% to 0% (without notifying or auditing) is a contract breach risk.

**Fix dispatch:**
```
1. Wrap each handler in db.transaction:
   - UPDATE business_accounts ...
   - INSERT admin_actions row (action_type per operation, target_type='business_account', details, reason)
2. After commit, send notification to business owner_user_id:
   - Suspend: 'Your account "X" has been suspended. Reason: ...'
   - Discount change: 'Your volume discount has been updated to N%.'
   - Manager change: 'Your dedicated manager is now [name].'
3. Add Zod schemas for set-discount + assign-manager (currently manual checks at line 700-717, 661-664).
4. Test: suspend business account → admin_actions row exists, notification sent.
```

### CRIT-66 — Recurring booking cancel by admin has no audit + no notification
**File:** [packages/api/src/routes/admin.routes.ts:476-502](packages/api/src/routes/admin.routes.ts#L476)
```ts
const result = await db.query(
  `UPDATE recurring_bookings SET status = 'cancelled', cancelled_at = NOW(), ...`,
  [reason ?? 'Cancelled by admin', id],
);
```
- No audit row.
- No notification to customer (whose recurring booking is now silently terminated).
- `requireAdmin` (not `requireSuperAdmin`) — any admin can cancel anyone's recurring bookings.

For a customer who's relied on weekly cleaner services, this disappears their booking with no warning.

**Fix:** Wrap in transaction with audit + notification. Consider gating to `requirePermission('recurring.manage')` once CRIT-56 lands.

### CRIT-67 — Pricing rule DELETE has no audit + hard-delete
**File:** [packages/api/src/routes/admin.routes.ts:1121-1134](packages/api/src/routes/admin.routes.ts#L1121)
```ts
await pricingService.deletePricingRule(id);
res.json({ success: true, message: 'Pricing rule deleted.' });
```
Pricing rules affect surge prices on customer bookings. Hard delete = lost history. No audit row.

If a peak-hours rule was wrongly applied to a booking and customer disputes the surge, ops can't reconstruct what was active. The booking row stores `pricing_rule_id` as FK — once the rule is deleted, the FK dangles or cascades.

**Fix dispatch:**
```
1. Soft-delete: add deleted_at, deleted_by, deleted_reason columns to pricing_rules (migration).
2. pricingService.deletePricingRule UPDATE deleted_at + audit row in transaction.
3. listPricingRules and getPricingRuleById filter deleted_at IS NULL.
4. Booking-time queries that join pricing_rules already get the rule by id even after soft-delete — historical preservation.
5. Test: delete pricing rule → admin_actions row exists, listPricingRules excludes it.
```

---

## MEDIUM bugs

### MED-106 — Admin route handlers reimplement requireAdmin/requireSuperAdmin inline
**File:** [packages/api/src/routes/admin.routes.ts:23-33](packages/api/src/routes/admin.routes.ts#L23)
Two helper functions repeated as the first call in every handler. Extracted middleware would be cleaner and unifies behavior:
```ts
function requireAdminMiddleware(req, res, next) { ... }
router.use(authMiddleware, requireAdminMiddleware);
```

When CRIT-56 (`requirePermission(perm)`) lands, this becomes the natural place to hook permission enforcement.

### MED-107 — Block IP route has no IP format validation
**File:** [packages/api/src/routes/admin.routes.ts:1233-1263](packages/api/src/routes/admin.routes.ts#L1233)
```ts
if (typeof ipAddress !== 'string' || !ipAddress) throw createAppError('IP address is required.', 400);
```
Missing IP format check. `securityService.blockIp` passes to DB with `::inet` cast — invalid IP throws Postgres error which surfaces as 500. Validate format at the schema layer:
```ts
const blockIpSchema = z.object({
  ipAddress: z.string().ip(), // Zod 3.22+ has .ip() validator
  reason: z.string().min(5).max(500),
  expiresInHours: z.number().int().positive().max(8760).optional(), // max 1 year
});
```

### MED-108 — Admin invoice mark-paid bypasses audit
**File:** [packages/api/src/routes/admin.routes.ts:737-758](packages/api/src/routes/admin.routes.ts#L737)
Calls `invoiceService.markInvoicePaid(id, paymentReference)`. Per CRIT-40 (B08), the service has no payment verification AND no audit row. This route adds nothing on top — same vulnerabilities apply.

The route layer should at minimum write an admin_actions row before delegating, capturing `req.user.userId` + reason.

### MED-109 — A/B test create has no Zod schema
**File:** [packages/api/src/routes/admin.routes.ts:1348-1365](packages/api/src/routes/admin.routes.ts#L1348)
Manual `if (!name)` check only. trafficSplit, dates, configs all unvalidated. Build `createAbTestSchema`.

### MED-110 — Audit log route doesn't validate filter dates
**File:** [packages/api/src/routes/admin.routes.ts:1557-1564](packages/api/src/routes/admin.routes.ts#L1557)
`req.query.from`/`req.query.to` are passed directly to SQL without parsing as Date or validating format. Postgres handles invalid dates by erroring at query time — surfaces as 500. Validate format (YYYY-MM-DD) at parse time.

### MED-111 — Audit log query has no maximum date range
**File:** [packages/api/src/routes/admin.routes.ts:1531-1606](packages/api/src/routes/admin.routes.ts#L1531)
A naive query without filters scans the entire audit_log table. At scale, this kills the DB. Enforce a default 30-day window if no `from` is provided, and cap range at 1 year.

### MED-112 — Several B2B handlers return 400 status via `res.status().json` directly instead of throwing
**Files:** Lines 599, 641, 672, 701, 711, 726, 747
```ts
res.status(400).json({ success: false, message: 'X is required.' });
return;
```
Inconsistent with the rest of the codebase that uses `throw createAppError(...)`. Both work but the throw pattern goes through error.middleware.ts (consistent envelope, structured logging). Standardize.

### MED-113 — Service-area POST/PATCH wraps validation in Zod but missing audit
**Files:** [packages/api/src/routes/admin.routes.ts:806-870](packages/api/src/routes/admin.routes.ts#L806)
Service area creation + updates change which cities the platform serves. Affects matching, waitlist notifications, customer ability to book. No audit.

### MED-114 — listProviders/listCustomers/listBookings/etc. don't apply PII masking
Routes like `/customers`, `/providers`, `/bookings` all return raw email + phone. Same pattern as CRIT-63 — admin/support staff see raw customer PII. Apply `maskPiiForRole` everywhere a `users` row is returned.

---

## LOW / INFO

- **Pricing rules CRUD uses Zod validation** (createPricingRuleSchema, updatePricingRuleSchema). Bug 269 (D05) fix in place — multiplier and platformSurgeShare bounded.
- **Service area validators** include PH bounds (Bug 320/322 D05) at the validator level, mirroring the migration 074 DB constraints.
- **Admin actions endpoint** (line 366-391) is super_admin only AND applies PII masking. This is the model.
- **All endpoints use requireAdmin or requireSuperAdmin** — but per CRIT-56, this only checks role string, not the permission system that's actually defined.

---

## Cross-cutting observations from admin.routes.ts

1. **The CRIT-56 (RBAC permission gap) is now visible at scale.** Every admin route is `requireAdmin` (= role === 'admin' OR 'super_admin'). The granular permission system in admin_roles.permissions is checked nowhere.

2. **Audit gaps are pervasive.** The admin route file has ~50 endpoints. About 60% of write endpoints lack admin_actions audit rows. The B09 model (booking-admin.service.ts) is the exception, not the rule.

3. **PII leakage via raw responses is widespread.** Only the admin_actions getter applies maskPiiForRole. The audit log, customer list, provider list, booking list all return raw PII. CRIT-63 is the worst offender but the others are similar patterns.

4. **B2B endpoints (business-accounts, invoices, recurring) are the weakest area.** No Zod validation, no audit, no notifications, money-relevant changes (volume discount) silently applied.

---

## PHASE C COMPLETE

All Phase C files read in full:
- 8 middleware files
- 10 utils + configs + validators
- 5 services (auth, admin-2fa, admin, staff, security)
- 2 routes (auth, admin)

**Total: 6,075 lines.**
