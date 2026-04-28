# Phase 06 — Paper Trace

End-to-end traces for each new feature delivered in Phase 06 (Customer 360).

## 1. Customer Profile (GET /api/v1/admin/customers/:id)

```
[admin browser] /customers/<uuid>
   ↓ react-router lazy-loads CustomerDetailPage
   ↓ useQuery → /api/v1/admin/customers/:id
[express] auth.middleware → JWT verified → req.user populated
   ↓ requireAdmin (role admin or super_admin, else 403)
   ↓ customer-admin.routes.ts GET /:id handler
[service] customer-admin.service.ts::getCustomerProfile(id)
   ↓ SELECT users WHERE id=$1 AND role='customer'           (1 query)
   ↓ if no row → throw 404
   ↓ Promise.all([
       SELECT lifetime stats (bookings count, sum total_amount, avg rating
              given, count reviews)                          (1 query)
       SELECT customer_addresses ORDER BY is_default DESC    (1 query)
       SELECT suki_memberships JOIN providers                (1 query)
     ])
   ↓ shape into CustomerProfile { addresses, sukiProviders, lifetime* }
[response] { success: true, data: <CustomerProfile> }
[browser] CustomerHeader + ProfileTab render
```
**Total queries:** 4 (1 sequential + 3 parallel). **No N+1.**

## 2. Customer Bookings (GET /:id/bookings)

```
[browser] BookingsTab → useQuery (page, statusFilter)
[route] requireAdmin → service.getCustomerBookings(id, page, pageSize, status?)
[service] page≥1, pageSize ∈ [1,100]
   ↓ COUNT(*) FROM bookings WHERE customer_id=$1 [AND status=$2]   (1)
   ↓ SELECT bookings JOIN providers JOIN service_categories
       LEFT JOIN reviews +
       EXISTS(SELECT 1 FROM disputes) ORDER BY scheduled_at DESC
       LIMIT $N OFFSET $M                                          (1)
[response] { rows, total, page, pageSize }
```
**Total queries:** 2. **No N+1.** Null `category_name` coerced to "Uncategorized".

## 3. Customer Payments (GET /:id/payments)

```
[browser] PaymentsTab → useQuery
[route] requireAdmin → service.getCustomerPayments(id)
[service] Promise.all 4 queries:
   1. SELECT wallets type='customer' available_balance + pending_balance  (1)
   2. SELECT wallet_transactions LIMIT 20 ORDER BY created_at DESC        (1)
   3. SELECT payment_intents JOIN bookings LIMIT 10 ORDER BY created_at   (1)
   4. SELECT payment_method, COUNT(*) GROUP BY payment_method             (1)
[response] { walletAvailable, walletPending, recentTransactions[],
             recentPaymentIntents[], paymentMethodCounts: { gcash: N, ... } }
```
**Total queries:** 4 in parallel. Wallet missing → returns 0 (does NOT
auto-create here; only `creditCustomerWallet` may create).

## 4. Customer Disputes + Fraud Pattern (GET /:id/disputes)

```
[browser] DisputesTab → useQuery
[route] requireAdmin → service.getCustomerDisputes(id)
[service]
   ↓ SELECT disputes JOIN bookings JOIN providers WHERE filed_by=$1
       ORDER BY created_at DESC LIMIT 200                           (1)
   ↓ JS aggregation:
       lookback = now - 30 days
       recent = rows where created_at >= lookback
       resolved = recent.filter(r.status==='resolved')
       favorProvider = resolved.filter(r.resolutionType ∈
         {'no_refund','refund_with_warning','refund_with_suspension'})
       rate = favorProvider.length / resolved.length  (or null if 0)
       flagged = recent.length ≥ 5 AND rate ≥ 0.8
[response] { rows, fraudPattern: { disputesLast30Days, favorProviderRate,
                                     flagged, reason } }
[browser] DisputesTab renders banner if flagged
```
**Total queries:** 1. Detection runs purely in JS over the already-fetched rows.

## 5. Customer Referrals (GET /:id/referrals)

```
[browser] ReferralsTab → useQuery
[route] requireAdmin → service.getCustomerReferrals(id)
[service] 3 queries in parallel:
   1. SELECT referral_codes WHERE owner_id=$1                       (1)
   2. SELECT referrals JOIN users (referee) WHERE referrer_id=$1    (1)
   3. SELECT referrals JOIN users (referrer) WHERE referee_id=$1
       LIMIT 1                                                       (1)
   ↓ totalEarnedFromReferrals = SUM(given.referrer_bonus
                                    WHERE referrer_credited)
[response] { ownCodes[], given[], received: {…}|null,
             totalEarnedFromReferrals }
```
**Total queries:** 3 in parallel.

## 6. Customer Activity (GET /:id/activity)

```
[route] requireAdmin → service.getCustomerActivity(id, limit≤200)
[service]
   1. SELECT phone FROM users WHERE id=$1 AND role='customer'   (1)
      → 404 if missing
   2. parallel:
      a. SELECT audit_log WHERE entity_id=$1 OR user_id=$1
      b. SELECT login_attempts WHERE phone=<users.phone>
      c. SELECT admin_actions WHERE target_id=$1 AND
                                     target_type='customer'
   3. merge in JS, sort by createdAt DESC, slice to limit
[response] flat list of {source: 'audit'|'login'|'admin_action',
                          action, detail, ipAddress, userAgent, createdAt}
```
**Total queries:** 4 (1 + 3 parallel). limit clamped [1,200].

## 7. Update Customer Status (PUT /:id/status) — super-admin only

```
[super-admin] CustomerHeader → "Manage status" → Suspend/Reactivate/Flag-Fraud
[route] requireSuperAdmin → service.updateCustomerStatus(id, action, reason, adminId)
[validation]
   - reason ≥ 5 chars (trimmed)
   - action ∈ {suspend, reactivate, flag_fraud}
[service] db.transaction:
   BEGIN
   ↓ SELECT id, is_active FROM users WHERE id=$1 AND role='customer'
       FOR UPDATE
   ↓ if missing → throw 404 → ROLLBACK
   ↓ resolve newIsActive + actionType:
       suspend     → false, 'customer_suspended'
       reactivate  → true,  'customer_reactivated'
       flag_fraud  → unchanged, 'customer_suspended' (with [fraud_flag] reason
                                  prefix; admin_actions.action_type CHECK
                                  doesn't allow 'flag_fraud' as a value)
   ↓ if action !== 'flag_fraud' AND newIsActive !== currentIsActive:
       UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2
       (idempotent — skips UPDATE when state unchanged)
   ↓ INSERT INTO admin_actions (id, admin_id, action_type, target_id,
                                 target_type='customer', details(json), reason)
   COMMIT
[audit] auditMiddleware writes audit_log row automatically (PUT method)
[response] { id, isActive }
```

## 8. Credit Customer Wallet (POST /:id/credit) — SACRED MONEY MOVEMENT

```
[super-admin] PaymentsTab → "Issue wallet credit" form (visible only super_admin)
[route] requireSuperAdmin → service.creditCustomerWallet(id, amount, reason, adminId)
[validation]
   - amount must be non-zero integer (centavos)
   - reason ≥ 5 chars (trimmed)
[service] db.transaction:
   BEGIN
   ↓ SELECT id FROM users WHERE id=$1 AND role='customer' FOR UPDATE
       → 404 if missing
   ↓ SELECT id, available_balance FROM wallets
       WHERE user_id=$1 AND type='customer' FOR UPDATE
   ↓ if no wallet:
       INSERT INTO wallets (id, user_id, type='customer',
                            available_balance=0, ...)
       SELECT … FOR UPDATE again on the new row (lock consistency)
   ↓ newBalance = currentBalance + delta
   ↓ if newBalance < 0 → throw 400 → ROLLBACK
   ↓ UPDATE wallets SET available_balance=$1
   ↓ INSERT INTO wallet_transactions (
         type='adjustment',
         amount=delta,  balance_after=newBalance,
         description="[admin:<id>] <reason>",
         reference_id="admin_credit:<id>")
   ↓ if INSERT returns no id → throw 500 → ROLLBACK
   ↓ INSERT INTO admin_actions (id, admin_id, action_type='customer_credited'
                                   /* SQL literal — see HONESTY-CHECK */,
                                   target_id, target_type='customer',
                                   details(json), reason)
   COMMIT
[audit] auditMiddleware writes audit_log row automatically (POST method)
[response] { walletId, newAvailableBalance, transactionId }
```
**Money conservation:** balance_after equals previous balance + delta,
atomically with the wallet UPDATE inside one transaction. Negative delta
debits, positive credits. Cannot leave wallet negative. Wallet row may be
auto-created on first credit but the lock is re-acquired before write.
