# Phase 05 — Paper Trace

End-to-end traces for each new feature delivered in Phase 05 (Provider 360).

## 1. Provider Profile (GET /api/v1/admin/providers/:id/profile)

```
[admin browser] /providers/<uuid>
   ↓ react-router lazy-loads ProviderDetailPage
   ↓ useQuery fetches /api/v1/admin/providers/:id/profile
[express] auth.middleware → JWT verified → req.user populated
   ↓ requireAdmin(req) → role admin or super_admin (else 403)
   ↓ provider-admin.routes.ts GET /:id/profile handler
[service] provider-admin.service.ts::getProviderProfile(id)
   ↓ SELECT providers JOIN users WHERE p.id=$1            (1 query)
   ↓ if no row → throw 404
   ↓ Promise.all([
       SELECT provider_services JOIN service_categories,  (1 query)
       SELECT provider_service_areas JOIN service_areas   (1 query)
     ])
   ↓ shape into ProviderProfile { user, documents, categories, serviceAreas }
[response] { success: true, data: <ProviderProfile> }
[browser] ProviderHeader + ProfileTab render
```
**Total queries:** 3 (1 + 2 in parallel). **No N+1.**

## 2. Provider Jobs (GET /:id/jobs)

```
[browser] JobsTab → useQuery (page, statusFilter)
[route] requireAdmin → service.getProviderJobs(id, page, pageSize, status?)
[service] params clamped: page≥1, pageSize ∈ [1,100]
   ↓ COUNT(*) bookings WHERE provider_id=$1 [AND status=$2]   (1)
   ↓ SELECT bookings JOIN customer JOIN category LEFT JOIN reviews +
       EXISTS(SELECT … FROM disputes) ORDER BY scheduled_at DESC
       LIMIT $N OFFSET $M                                       (1)
[response] { rows, total, page, pageSize }
```
**Total queries:** 2. **No N+1.**

## 3. Provider Financials (GET /:id/financials)

```
[browser] FinancialsTab → useQuery
[route] requireAdmin → service.getProviderFinancials(id)
[service] Promise.all 4 queries:
   1. SUM earned (escrow_release positive) + ABS commission     (1)
   2. wallets row available_balance + pending_balance           (1)
   3. last 12 months earnings GROUP BY month                    (1)
   4. last 20 payouts ORDER BY created_at DESC                  (1)
[response] { totalEarned, totalCommissionPaid, walletAvailable, walletPending,
             monthlyEarnings[], recentPayouts[] }
```
**Total queries:** 4 in parallel. **No N+1.**

## 4. Wallet Adjustment (POST /:id/wallet/adjust) — SACRED MONEY MOVEMENT

```
[super-admin] FinancialsTab → "Adjust Wallet" form (visible only for super_admin role)
[route] requireSuperAdmin → service.adjustProviderWallet(id, amount, reason, adminUserId)
[validation]
   - amount must be non-zero integer (centavos)
   - reason ≥ 5 chars (trimmed)
[service] db.transaction:
   BEGIN
   ↓ SELECT … FOR UPDATE on provider's wallet (row-locked)
   ↓ if no wallet → throw 404 → ROLLBACK
   ↓ newBalance = currentBalance + delta
   ↓ if newBalance < 0 → throw 400 → ROLLBACK
   ↓ UPDATE wallets SET available_balance = newBalance
   ↓ INSERT INTO wallet_transactions (type='adjustment', balance_after=newBalance,
                                       description="[admin:<id>] <reason>",
                                       reference_id="admin_adjustment:<id>")
   COMMIT
[audit] auditMiddleware writes audit_log row automatically (POST method)
[response] { walletId, newAvailableBalance, transactionId }
```
**Money conservation:** balance_after equals previous balance + delta, atomically with the wallet update. Negative delta debits, positive credits. **Cannot leave wallet negative.**

## 5. Notes CRUD (GET/POST/PATCH/DELETE /:id/notes[/:noteId])

```
LIST:    requireAdmin → SELECT … ORDER BY pinned DESC, created_at DESC      (1)
CREATE:  requireAdmin → validate body+category → INSERT → SELECT recent     (2)
UPDATE:  requireAdmin → SELECT author_id → check (author OR super_admin)
                      → UPDATE … SET …                                       (2)
DELETE:  requireAdmin → SELECT author_id → check ownership/super
                      → DELETE                                               (2)
```
**Audit:** all writes captured by auditMiddleware.

## 6. Activity (GET /:id/activity)

```
[route] requireAdmin → service.getProviderActivity(id, limit≤200)
[service]
   1. SELECT user_id, phone FROM providers JOIN users WHERE p.id=$1   (1)
   2. parallel:
      a. SELECT audit_log WHERE entity_id IN (provider_id, user_id) LIMIT N
      b. SELECT login_attempts WHERE phone=$1 LIMIT N
   3. merge in JS, sort desc by createdAt, slice to limit
[response] flat list of {source, action, ipAddress, userAgent, createdAt}
```
**Total queries:** 3 (1 + 2 in parallel). **No N+1.**

## 7. Reviews mutations (PATCH visibility/response)

```
PATCH /:id/reviews/:reviewId/visibility
   requireAdmin → UPDATE reviews SET is_visible WHERE id=$1
   if rowCount=0 → 404
   audit row written by middleware

PATCH /:id/reviews/:reviewId/response
   requireAdmin → validate non-empty
   UPDATE reviews SET admin_response WHERE id=$1
   if rowCount=0 → 404
```

## 8. Frontend route mounting

```
apps/admin/src/App.tsx
   <Route path="/providers/:id" element={<ProviderDetailPage />} />
apps/admin/src/pages/ProvidersPage.tsx
   row name → <Link to={`/providers/${r.id}`}>…</Link>
```
