# PHASE 07 — BOOKING 360 + DISPUTE DETAIL

**Goal:** Build the missing booking detail page with full evidence package, and complete the dispute resolution interface with all evidence visible side-by-side.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/07-booking-360`
**Estimated time:** 10 hours
**Dependencies:** Phase 06 complete and merged
**Risk:** Medium — touches dispute resolution which moves money

---

## Step 1 — Pre-flight (standard)

## Step 2 — Backend endpoints

```
GET  /api/v1/admin/bookings/:id                      Full booking + customer + provider summaries
GET  /api/v1/admin/bookings/:id/timeline             All events with timestamps
GET  /api/v1/admin/bookings/:id/evidence             Photos, chat history, GPS log
GET  /api/v1/admin/bookings/:id/dispute              Dispute (if any) with full evidence
POST /api/v1/admin/bookings/:id/escrow/release       Manual escrow release (super admin, audited)
POST /api/v1/admin/bookings/:id/escrow/refund        Full or partial refund (super admin, audited)
POST /api/v1/admin/bookings/:id/reassign             Reassign to different provider
POST /api/v1/admin/bookings/:id/cancel               Admin cancellation with reason
POST /api/v1/admin/bookings/:id/force-complete       Force completion (super admin, very rare)

GET  /api/v1/admin/disputes/:id                      Full dispute detail
POST /api/v1/admin/disputes/:id/assign               Assign to admin
POST /api/v1/admin/disputes/:id/resolve              Resolve with outcome (full/partial refund/no refund)
POST /api/v1/admin/disputes/:id/escalate             Escalate to senior admin
POST /api/v1/admin/disputes/:id/message              Send message to customer or provider
POST /api/v1/admin/disputes/:id/reopen               Reopen resolved dispute (super admin)
```

## Step 3 — Routes

```tsx
const BookingDetailPage = lazy(() => import('@/pages/BookingDetailPage'));
const DisputeDetailPage = lazy(() => import('@/pages/DisputeDetailPage'));

<Route path="/bookings/:id" element={<BookingDetailPage />} />
<Route path="/disputes/:id" element={<DisputeDetailPage />} />
```

## Step 4 — BookingDetailPage layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Bookings                                           │
│                                                              │
│ Booking #BK-12345                              [Status pill] │
│ Cleaning · Fixed price · ₱1,500                              │
│                                                              │
│ ┌── PARTIES ───────┐ ┌── TIMELINE ──────┐ ┌── EVIDENCE ──┐  │
│ │ Customer:         │ │ ● Booking created│ │ Before photos│  │
│ │  [photo] Maria    │ │   2025-04-25     │ │ During photos│  │
│ │  4.9 ★ 23 jobs    │ │ ● Provider assgnd│ │ After photos │  │
│ │  +63 9XX...       │ │   2025-04-26     │ │ Chat history │  │
│ │                   │ │ ● En route       │ │ GPS log map  │  │
│ │ Provider:         │ │   GPS: 14.55,121 │ │ Receipts     │  │
│ │  [photo] Juan     │ │ ● Arrived        │ │              │  │
│ │  4.7 ★ 156 jobs   │ │   GPS verified ✓ │ │              │  │
│ │  +63 9XX...       │ │ ● Job started    │ │              │  │
│ │                   │ │ ● Photo uploaded │ │              │  │
│ │ Service Address:  │ │ ● Completed      │ │              │  │
│ │  Brgy. Lagao      │ │ ● Customer confd │ │              │  │
│ │  Kalibo           │ │ ● Escrow released│ │              │  │
│ │                   │ │ ● Provider paid  │ │              │  │
│ └───────────────────┘ └──────────────────┘ └──────────────┘  │
│                                                              │
│ ┌── MONEY BREAKDOWN ──────────────────────────────────────┐ │
│ │ Service price:        ₱1,500.00                          │ │
│ │ Service fee (10%):    ₱150.00                            │ │
│ │ Total customer paid:  ₱1,650.00                          │ │
│ │ Commission (15%):     ₱225.00                            │ │
│ │ Provider received:    ₱1,275.00                          │ │
│ │ Platform retains:     ₱375.00                            │ │
│ │ Guarantee fund:       ₱2.25                              │ │
│ └───────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── ADMIN AUDIT TRAIL ────────────────────────────────────┐ │
│ │ [list of all admin actions on this booking]             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Manual Release] [Refund] [Reassign] [Cancel]                │
│ (super admin only)                                           │
└──────────────────────────────────────────────────────────────┘
```

## Step 5 — DisputeDetailPage layout

Two-column layout:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Disputes                                           │
│                                                              │
│ Dispute #DSP-1234 · Booking #BK-12345 · Open 24h             │
│ [Severity tier] [Auto-priority badge: amount × age]          │
│                                                              │
│ ┌── CUSTOMER CLAIM ────────┐ ┌── PROVIDER RESPONSE ────────┐ │
│ │ Maria filed 2 hours ago  │ │ Juan responded 1 hour ago   │ │
│ │                          │ │                              │ │
│ │ Type: Incomplete work    │ │ "I cleaned everything that  │ │
│ │                          │ │  was visible. The customer  │ │
│ │ "The provider didn't     │ │  asked for additional work  │ │
│ │  clean under the bed     │ │  not in the original scope."│ │
│ │  and the bathroom mirror │ │                              │ │
│ │  is still streaky."      │ │ [Photos: 3 after-shots]     │ │
│ │                          │ │                              │ │
│ │ [Photos: 4 after-shots]  │ │ GPS log shows on-site 90min │ │
│ └──────────────────────────┘ └──────────────────────────────┘ │
│                                                              │
│ ┌── EVIDENCE TIMELINE ────────────────────────────────────┐  │
│ │ Chat history (full transcript)                          │  │
│ │ Booking timeline (with photo thumbnails inline)         │  │
│ │ GPS log map view                                        │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌── CUSTOMER HISTORY ─────────┐ ┌── PROVIDER HISTORY ────┐  │
│ │ 5 disputes in 90 days       │ │ 12 disputes in 90 days │  │
│ │ 2 favored customer (40%)    │ │ 8 lost (67%)           │  │
│ │ Pattern: REVIEW REQUIRED    │ │ Pattern: AT RISK       │  │
│ └─────────────────────────────┘ └────────────────────────┘  │
│                                                              │
│ ┌── RESOLUTION FORM ──────────────────────────────────────┐ │
│ │ Outcome: ◉ Full refund  ○ Partial (X%)  ○ No refund     │ │
│ │           ○ Refund + warning  ○ Refund + suspension      │ │
│ │ Reason (required, visible to user):                      │ │
│ │  [textarea]                                              │ │
│ │ Internal notes (admin only):                             │ │
│ │  [textarea]                                              │ │
│ │ [Resolve and notify]  [Escalate]  [Request more info]    │ │
│ └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

When admin clicks "Resolve and notify":
1. Confirm modal: "This will refund ₱X to customer and X to provider. Are you sure?"
2. On confirm: dispute service moves the money, sends notifications to both parties, updates booking status, creates audit log entry
3. The money conservation test must still pass after every dispute resolution

## Step 6 — Update DisputesPage list

Make rows clickable. Add SLA timer column (auto-color: green <24h, yellow 24-48h, red >48h). Add bulk filter "stale only" (>48h open). Add export.

## Step 7 — Update BookingsPage list

Make rows clickable. Add real-time status badges (uses Phase 10 socket integration). Add map view tab.

## Step 8 — Tests

For each money-moving endpoint:
- Money conservation test (in = out for all parties)
- Audit log entry created
- Notifications sent
- Status transition valid

## Step 9 — Verify, commit, report. STOP.
