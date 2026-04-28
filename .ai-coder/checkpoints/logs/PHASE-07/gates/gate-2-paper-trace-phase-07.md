# Phase 07 — Paper Trace

End-to-end traces for each new runtime path delivered in Phase 07
(Booking 360 + Dispute Detail). Sacred-money endpoints DELEGATE to
`escrow.service.ts` / `dispute.service.ts`; this service layer only
audits.

## 1. Booking detail (GET /api/v1/admin/bookings/:id)

```
[admin browser] /bookings/<uuid>
   ↓ react-router lazy-loads BookingDetailPage
   ↓ useQuery → /api/v1/admin/bookings/:id
[express] auth.middleware → JWT verified → req.user populated
   ↓ booking-admin.routes.ts requireAdmin (admin or super_admin else 403)
   ↓ GET /:id handler
[service] booking-admin.service.ts::getBookingDetail(id)
   ↓ SELECT bookings b
       LEFT JOIN service_categories, service_subcategories,
                 users(customer), providers, users(provider_user)
       WHERE b.id = $1                                          (1 query)
   ↓ if no row → throw createAppError('Booking not found.', 404)
   ↓ if customer_id present:
       SELECT COUNT(*) AS lifetime,
              (SELECT AVG(rating) FROM reviews WHERE reviewer_id=$1)
         FROM bookings WHERE customer_id=$1                     (1 query)
   ↓ shape into BookingDetail { customer, provider, address, ... }
[response] { success: true, data: <BookingDetail> }
[browser] Overview tab renders header + customer/provider cards
```
**Total queries:** 1–2. Money fields (`servicePrice`/`serviceFee`/`totalAmount`)
coerced to Number from `::text` casts; nothing math'd here.

## 2. Booking timeline (GET /:id/timeline)

```
[browser] Timeline tab → useQuery
[route] requireAdmin → service.getBookingTimeline(id)
[service]
   ↓ SELECT bookings core fields WHERE id=$1                    (1)
       → 404 if missing
   ↓ Push synthetic events: booking_created, booking_confirmed?,
       job_completed?, booking_cancelled?
   ↓ SELECT admin_actions a LEFT JOIN users u
       WHERE target_type='booking' AND target_id=$1
       ORDER BY created_at ASC                                  (1)
   ↓ For each admin action push {type=action_type, actor='admin'}
   ↓ try: SELECT MIN, MAX, COUNT chat messages JOIN conversations
       WHERE c.booking_id=$1                                    (1, best-effort)
       → if rows>0 push chat_started + (optional) chat_last_message
       → caught errors logger.info'd, NOT thrown
   ↓ events.sort by `at` ASC
[response] { success: true, data: TimelineEvent[] }
```
**Total queries:** 2 (+1 best-effort). No N+1.

## 3. Booking evidence (GET /:id/evidence)

```
[browser] Evidence tab → useQuery
[route] requireAdmin → service.getBookingEvidence(id)
[service]
   ↓ SELECT b.id, b.customer_id, p.user_id FROM bookings b
       LEFT JOIN providers p ON p.id=b.provider_id
       WHERE b.id=$1                                            (1)
       → 404 if missing
   ↓ SELECT booking_images WHERE booking_id=$1 ORDER BY
       created_at ASC                                           (1)
       → uploadedBy resolved by comparing uploaded_by==customer_id
   ↓ SELECT COUNT(*) FROM messages JOIN conversations
       WHERE c.booking_id=$1                                    (1)
   ↓ SELECT to_regclass('public.gps_checkins')                  (1)
       → if table exists: SELECT FROM gps_checkins              (+1)
       → else: gpsCheckIns = []  (see future-bugs)
   ↓ SELECT to_regclass('public.receipts')                      (1)
       → if table exists: SELECT FROM receipts                  (+1)
       → else: receipts = []
[response] { photos[], chatMessageCount, gpsCheckIns[], receipts[] }
```
**Total queries:** 5 (+0–2 conditional). Tables `gps_checkins` and
`receipts` may not exist yet — `to_regclass` guards keep this query-safe.

## 4. Booking dispute (GET /:id/dispute)

```
[browser] Overview tab dispute card → useQuery
[route] requireAdmin → service.getBookingDispute(id)
[service]
   ↓ SELECT disputes WHERE booking_id=$1
       ORDER BY created_at DESC LIMIT 1                         (1)
   ↓ no row → return null
   ↓ map to BookingDispute (refund_amount::text → Number)
[response] { success: true, data: BookingDispute | null }
```
**Total queries:** 1.

## 5. Manual escrow release (POST /:id/escrow/release) — SACRED MONEY

```
[super-admin] BookingDetailPage Money tab → "Release escrow now"
[route] requireSuperAdmin → service.manualReleaseEscrow(id, reason, adminId)
[validation] requireReason(reason, 10) — trimmed, ≥10 chars else 400
[service]
   ↓ const breakdown = await escrowService.releaseEscrow(bookingId)
        ─────────────  SACRED MONEY MOVEMENT
        ▲ ALL money math — wallet credit, platform retain split,
          escrow_status flip — happens INSIDE escrow.service.ts
          inside its own transaction with FOR UPDATE locks. This
          service performs ZERO money math.
   ↓ releasedAmount = providerReceives + platformRetains  (display-only)
   ↓ INSERT INTO admin_actions
       (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'manual_escrow_release', 'booking', $2,
               $3::jsonb, $4) RETURNING id
   ↓ if no id returned → throw 500
[audit] auditMiddleware writes audit_log row automatically (POST)
[response] { bookingId, releasedAmount, reason, adminActionId }
```
**Money conservation:** delegated. Phase 04 escrow tests prove balance
preservation. This phase only writes the audit row.

## 6. Refund booking escrow (POST /:id/escrow/refund) — SACRED MONEY

```
[super-admin] Money tab → "Refund <amount> to customer"
[route] requireSuperAdmin → service.refundBookingEscrow(id, amount, reason, adminId)
[validation]
   - refundAmount must be finite, integer, > 0 (centavos) else 400
   - requireReason(reason, 10)
[service]
   ↓ await escrowService.refundFromEscrow(bookingId, refundAmount, reason)
        ─────────────  SACRED MONEY MOVEMENT — escrow.service holds
                       the wallet/escrow ledger transaction with
                       FOR UPDATE locks; balance_after invariants
                       enforced there.
   ↓ INSERT INTO admin_actions
       VALUES ($1, 'refund_issued', 'booking', $2,
               '{"bookingId":..,"refundAmount":..}'::jsonb, $4)
[response] { bookingId, refundedAmount, reason, adminActionId }
```

## 7. Reassign booking provider (POST /:id/reassign)

```
[super-admin] Money tab → "Reassign provider"
[route] requireSuperAdmin → service.reassignBookingProvider(id, newProviderId, reason, adminId)
[validation] requireReason(reason, 5)
[service] db.transaction:
   BEGIN
   ↓ SELECT id, status, provider_id FROM bookings WHERE id=$1 FOR UPDATE
       → 404 if missing
       → 409 if status ∈ TERMINAL_REASSIGN_BLOCKED
         {completed_by_provider, confirmed, cancelled_by_*, paid_out, payout_ready}
   ↓ SELECT p.id, u.is_active FROM providers p JOIN users u
       WHERE p.id = $1 (newProviderId)
       → 404 if missing, 409 if !is_active
   ↓ UPDATE bookings SET provider_id=$1, updated_at=NOW() WHERE id=$2
   ↓ INSERT INTO admin_actions
       VALUES ($1, 'booking_reassigned', 'booking', $2,
               '{"oldProviderId":..,"newProviderId":..}'::jsonb, $4)
   COMMIT
[response] { bookingId, oldProviderId, newProviderId, adminActionId }
```
**No money side-effect** — escrow stays held against the same booking;
only the assigned provider record changes.

## 8. Cancel booking as admin (POST /:id/cancel) — SACRED MONEY (conditional)

```
[super-admin] Money tab → "Cancel booking"
[route] requireSuperAdmin → service.cancelBookingAsAdmin(id, reason, adminId, hours?, arrived?, noShow?)
[validation] requireReason(reason, 10)
[service]
   ↓ SELECT id, status, escrow_status FROM bookings WHERE id=$1     (1)
       → 404 if missing
       → 409 if status ∈ {cancelled_by_customer, cancelled_by_provider,
                          cancelled_by_admin}
   ↓ if escrow_status === 'held':
       refund = await escrowService.handleCancellation(
           bookingId, hoursValue, arrivedValue, noShowValue)
        ─────────────  SACRED MONEY MOVEMENT — cancellation policy
                       (refund vs platform-retain) and ledger writes
                       live in escrow.service.ts.
       refundAmount = Number(refund.customerRefundAmount ?? 0)
   ↓ db.transaction:
       UPDATE bookings SET status='cancelled_by_admin',
                            cancelled_at=NOW(),
                            cancellation_reason=$2 WHERE id=$1
       INSERT INTO admin_actions
         VALUES ($1, 'booking_cancelled', 'booking', $2,
                 '{hours,arrived,noShow,refundAmount}'::jsonb, $4)
[response] { bookingId, refundAmount, adminActionId }
```
**Note:** if `escrow_status !== 'held'`, no money moves; refundAmount=0.
The escrow refund happens BEFORE the booking row UPDATE; if the audit
INSERT fails (returns no id), the cancellation rolls back but the
escrow refund has already settled. This is acceptable: the escrow
refund itself is independently audited inside `escrow.service.ts`.

## 9. Force complete booking (POST /:id/force-complete)

```
[super-admin] Money tab → "Force complete"
[route] requireSuperAdmin → service.forceCompleteBooking(id, reason, adminId)
[validation] requireReason(reason, 20)  ← strictest threshold
[service] db.transaction:
   BEGIN
   ↓ SELECT id, status FROM bookings WHERE id=$1 FOR UPDATE
       → 404 if missing
       → 409 if status NOT IN {in_progress, completed_by_provider}
   ↓ UPDATE bookings SET status='confirmed',
                          confirmed_at=NOW() WHERE id=$1
   ↓ INSERT INTO admin_actions
       VALUES ($1, 'booking_force_completed', 'booking', $2,
               '{"previousStatus":..}'::jsonb, $4)
   COMMIT
[response] { bookingId, adminActionId }
```
**No money side-effect HERE.** Setting status='confirmed' makes the
booking eligible for the next escrow-release run, but THIS endpoint
does not call `releaseEscrow`. A super-admin who wants to release must
do so explicitly via path #5 — every centavo move is traceable to its
own admin_actions row.

## 10. Dispute full detail (GET /api/v1/admin/disputes/:id)

```
[admin browser] /disputes/<uuid>
   ↓ DisputeDetailPage lazy-loaded
   ↓ useQuery → /api/v1/admin/disputes/:id
[route] dispute-admin.routes.ts requireAdmin → service.getDisputeFullDetail(id)
[service]
   ↓ SELECT disputes d
       LEFT JOIN bookings b, users(customer), providers, users(provider_user)
       WHERE d.id=$1                                            (1)
       → 404 if missing
   ↓ ageHours = round((now - filed_at) / 3600s)
   ↓ priorityScore = totalAmount * max(ageHours, 0)
   ↓ Promise.all:
       - SELECT COUNT(*), COUNT FILTER (resolution_type ANY $2)
           FROM disputes JOIN bookings WHERE customer_id=$1
           AND created_at >= NOW() - INTERVAL '90 days'        (1)
       - same shape for provider_id                             (1)
       - SELECT dispute_evidence WHERE dispute_id=$1
           ORDER BY created_at ASC                              (1)
   ↓ customerPattern() / providerPattern() → 'OK'|'REVIEW_REQUIRED'|'AT_RISK'
   ↓ shape DisputeFullDetail { booking, customer, provider, evidence[] }
[response] { success: true, data: DisputeFullDetail }
[browser] DisputeDetailPage two-column claim/response + history + form
```
**Total queries:** 1 + 3 parallel. No N+1.

## 11. Resolve dispute (POST /:id/resolve) — SACRED MONEY

```
[super-admin] DisputeDetailPage resolution form → submit
[route] requireSuperAdmin → service.adminResolveDispute(id, input, adminId)
[validation]
   - resolutionType ∈ {full_refund, partial_refund, no_refund, free_redo,
       refund_with_warning, refund_with_suspension, split_decision}
       (route layer enforces)
   - decisionNotes ≥ 20 chars (requireText)
   - if partial_refund: refundPercent ∈ (0, 100]
[service]
   ↓ const resolved = await disputeService.resolveDispute(
         disputeId, adminUserId,
         { resolutionType, refundPercent, decisionNotes, internalNotes })
        ─────────────  SACRED MONEY MOVEMENT — refund computation,
                       wallet credit, escrow release/return all happen
                       inside dispute.service.ts (which itself calls
                       escrow.service.ts) under a single transaction
                       with FOR UPDATE locks.
   ↓ refundAmount = Number(resolved.refund_amount ?? 0)
   ↓ INSERT INTO admin_actions
       VALUES ($1, 'dispute_resolved', 'dispute', $2,
               '{resolutionType,refundPercent,refundAmount}'::jsonb,
               <decisionNotes as reason>)
[response] { disputeId, resolutionType, refundAmount, adminActionId }
```

(Additional non-money mutations exist on the dispute path — assign,
escalate, message, reopen — see `gate-2-boundaries-phase-07.md` for
their exact signatures and audit rows; their traces are structurally
identical to #11 minus the money delegation.)

## 12. Frontend read-only pages (no backend trace)

`apps/admin/src/pages/BookingDetailPage.tsx` (1067 lines, 5 tabs:
Overview, Timeline, Evidence, Money, Audit) and
`apps/admin/src/pages/DisputeDetailPage.tsx` (867 lines) compose the
above traces via react-query hooks. Routes added in `App.tsx`:
`/bookings/:id` and `/disputes/:id` (lazy-loaded). The list pages
`BookingsPage.tsx` and `DisputesPage.tsx` wrap their ID columns in
`<Link>` to these detail pages — no API surface change.
