# 08 - Dispatch and Live Operations

Purpose: how the live operation runs day to day, so the ops team can keep paid jobs moving, find providers fast, and step in by hand the moment auto-dispatch stalls.

Related docs: `06-customer-support-sop.md`, `07-provider-support-sop.md`, `09-trust-safety-and-disputes.md`, `10-money-and-compliance-ops.md`, `11-admin-system-training-manual.md`, `12-quality-standards-and-kpis.md`.

---

## 1. Why dispatch is the most time-sensitive job we have

A booking must reach dispatch only after the server records it paid with held escrow. So when you watch a real dispatch row, verify the paid/held state and then focus on finding a provider fast. Treat every unmatched, verified-paid booking as a clock that is already running. A pending browser payment attempt is not a dispatch booking.

> ACCURACY NOTE: E03 fixed the booking/escrow ordering, so only verified payment may produce a paid/held dispatch record. E14 still blocks the current external hosted PayMongo authorization link. Dispatchers must not promote a pending attempt into dispatch or tell a customer to retry that link; see `.ai-coder/escalations/E14-paymongo-hosted-checkout-flow-2026-08-24.md`.

---

## 2. Auto-dispatch in plain language

When a fixed-price booking is created with a valid location and the admin setting `auto_dispatch_enabled` is on, the system tries to find a provider for it automatically. Quote-based bookings do NOT auto-dispatch. They use the quote flow instead (providers send quotes, customer picks one).

How the auto-offer works, step by step:

1. The system builds a ranked list of nearby providers who match the service category and are eligible (status `approved` AND `is_available = TRUE`, inside range, not already offered this job).
2. It offers the job to ONE provider at a time, not a broadcast. That provider gets a push notification ("new job available").
3. That provider has **45 seconds** to Accept or Decline (`OFFER_TIMEOUT_SECONDS = 45`).
4. If they Accept, the job is theirs. The booking moves to `matched`, their sibling offers are cancelled, and dispatch is done.
5. If they Decline, the system immediately offers the next provider on the list.
6. If they do nothing, the offer expires at 45 seconds. A background sweep (runs every 5 seconds) marks it expired and re-offers to the next provider.
7. This repeats provider by provider until someone accepts OR the system runs out of untried candidates OR the attempt cap is hit.

### The two hard limits to remember

| Limit | Value | What happens when it is hit |
|---|---|---|
| Offer timeout | 45 seconds per provider | Offer expires, system re-offers to next provider |
| Max offer attempts | 10 (`MAX_OFFER_ATTEMPTS`) | Cycle stops trying. No more auto-offers go out for this booking. |

When the system runs out of untried providers OR hits the 10-attempt cap, it notifies the customer ONCE with "no provider available" and stops. It does not keep spamming. After that point it is a human's job (yours) to act. See section 5.

### Other timers that touch dispatch

- A `requested` booking that never gets matched expires after **72 hours** (`unmatchedBookingExpiryHours`). Do not let a paid job sit anywhere near that long. Hours, not days, is the target.
- The 5-second sweep (`sweepExpiredOffers`) is what keeps the cycle moving on its own. If offers look frozen, that is a signal something is wrong (see section 11 ops checklist).

---

## 3. The Dispatch Console - what to watch

Admin page: **Dispatch** (`/dispatch`, `DispatchConsolePage.tsx`). It is a real-time three-panel console.

What is on screen:

- **Header counters:** active bookings, providers online (online = `approved` AND `is_available = TRUE`), socket connection status, and filters for city / status / service.
- **Map:** Leaflet/OSM map with markers for bookings and online providers. Live GPS updates flow in over the socket (`gps_update`).
- **Active Bookings list:** capped at 50 most relevant. Live-updates over the socket (`booking:created`, `booking:status_changed`).
- **Alert tail:** the last 20 live alerts (`alert:new`).

The default map center is Cebu City. Use the city filter for the active service area; service areas remain admin data rather than hardcoded launch markets.

### What requires super_admin

The console shows everything to any admin, but the action buttons (Reassign, Cancel, Message customer) only work for **super_admin** accounts. Plain `admin` accounts see a read-only banner. Make sure each shift has at least one super_admin on call who can actually push the buttons. See `02-org-structure-and-roles.md` and `11-admin-system-training-manual.md` for who has which role.

Super_admin row actions on the console:
- **Reassign** - pick an online provider, reason 5+ chars.
- **Cancel** - reason 10+ chars; triggers a refund per the cancellation policy.
- **Message customer** - 5 to 2000 chars; lands as a "Message from onService support" notification.

### What to scan, in order, every time you look at the board

1. Any booking stuck in `requested` (paid, no provider yet). These are your fires.
2. Any `no_provider_available` alert in the alert tail.
3. Providers-online count vs active-bookings count. If online providers are near zero in an active city, you have a coverage problem, not a dispatch problem.
4. Socket status. If it is disconnected, your board is stale. Refresh.

---

## 4. Monitoring active bookings by status

You manage by status. Here is the live state machine in plain terms, grouped by what a dispatcher does about each.

| Status | Plain meaning | Dispatcher action |
|---|---|---|
| `requested` | Created, paid (instant-pay target), no provider yet | WATCH CLOSELY. This is the dispatch queue. |
| `quoted` | Quote-based job with quotes in flight | Not auto-dispatch. Hands off unless stuck (see provider support). |
| `matched` | Provider accepted, not yet paid (legacy path) or assigned | Confirm they are moving. |
| `payment_pending` | Payment intent created, not completed | Customer-side. Watch it does not hang. |
| `paid` | Money in escrow, provider should be moving | Normal. |
| `provider_en_route` | Provider heading to site | Normal. Watch ETA. |
| `provider_arrived` | Provider on site | Normal. |
| `in_progress` | Job being done | Normal. Change orders may appear here. |
| `completed_by_provider` | Provider marked done, awaiting customer confirm | Current worker auto-confirms after 24h, but E18 records that this conflicts with the 48h dispute window. |
| `confirmed` | Customer confirmed | Escrow releasing to provider. |
| `disputed` | Customer filed a dispute | Hand to trust & safety (`09-...`). |
| `cancelled_by_*` | Cancelled by customer / provider / admin | Terminal. Check refund fired. |

Full booking monitor: **Bookings** page (`/bookings`). Search by booking ID or city, filter by status, see the escrow column. The list live-updates via `booking:status_changed`. Use Bookings for the full picture; use Dispatch for the live fight.

ACTIVE bucket (what counts as "in flight" for metrics): `requested`, `quoted`, `matched`, `payment_pending`, `paid`, `provider_en_route`, `provider_arrived`, `in_progress`, `disputed`.

---

## 5. "No provider available" - the playbook

This is the core live-ops skill. For a real dispatch row, verify the customer payment and held escrow first. Then get them a provider or, failing that, a clean refund and an honest message. Do not leave them silent.

Trigger: a `no_provider_available` alert, or you spot a `requested` booking sitting with no movement and the offer cycle has stopped (out of candidates or hit the 10-attempt cap).

### Decision tree

```
Paid booking with no provider
        |
        v
Are there ANY online providers in this city for this service?
        |                                   |
       YES                                  NO
        |                                   |
        v                                   v
Manual outreach + re-dispatch         Coverage gap.
(steps A1-A4)                         Go to step B.
        |
        v
Provider found?  --- YES ---> Manual reassign to them (section 6). Done.
        |
        NO
        |
        v
Go to step B (widen / notify / refund).
```

### A. Manual outreach + re-dispatch (providers exist but are not accepting)

- [ ] **A1.** Open the Dispatch Console, filter to the booking's city + service. Look at who is online on the map.
- [ ] **A2.** Re-fire dispatch by hand: `POST /bookings/:id/dispatch` (owner or admin). This re-kicks the offer cycle if there is an untried candidate. If the 10-attempt cap was already hit, this will not help and you go to manual reassign or step B.
- [ ] **A3.** Contact promising nearby providers directly (call/SMS/Viber per `07-provider-support-sop.md`). Ask them to flip their availability on and accept the next offer. Template below.
- [ ] **A4.** If a provider agrees, use **Reassign** to put the job on them directly (section 6). Do not wait for the auto-cycle if you already have a yes.

### B. Widen radius, notify, refund

- [ ] **B1.** Check the provider's and area's radius. A provider carries their own `service_radius_km`, and the service area has its own `radius_km`. If the booking sits just outside coverage, widening the relevant provider's radius (via Providers detail, admin edit allows up to 200 km) can pull in a candidate. Widening radius is a judgment call per booking, not a standing policy. Do not permanently inflate a provider's radius just to clear one job. Note it and set it back, or flag for review.
- [ ] **B1a.** Confirm the booking coordinates represent the actual property, not a city center. New bookings are server-gated, but legacy bookings and old saved addresses may lack coordinates. Do not manually dispatch until the customer supplies an exact pin or device location.
- [ ] **B2.** If still nothing, **message the customer** honestly from the console (5 to 2000 chars). Tell them what is happening and the next step. Template below.
- [ ] **B3.** If no provider can be found in a reasonable window, **cancel with a full refund** rather than letting them wait. Use the console Cancel (reason 10+ chars) or the Booking detail refund path. Because they pre-paid, a no-provider outcome is a clean 100% refund plus a goodwill credit (see the rule below). The live cancellation-refund brackets are built for customer/provider-caused cancellations, not platform coverage failures, so do not let those brackets reduce the refund here.

> **Set (editable):** a platform-side no-provider failure is a 100% full refund plus a ₱150 goodwill credit on top. _Recommended default. To change it, edit here and anywhere this value is referenced (`06-customer-support-sop.md`, `09-trust-safety-and-disputes.md`, `10-money-and-compliance-ops.md`)._

### Starting SLA targets for no-provider handling (tune these)

| Step | Target | Note |
|---|---|---|
| First manual action after a no-provider alert | within 5 minutes | Starting target |
| Customer gets a human message if still unmatched | within 15 minutes | Starting target |
| Cancel + full refund if truly no coverage | within 30 minutes | Starting target |
| Hard ceiling before escalation to ops lead | 60 minutes unmatched | Starting target |

These are starting numbers. Tune against real data once Cebu volume is steady. See `12-quality-standards-and-kpis.md`.

---

## 6. Manual reassignment

Use when you have a provider lined up by hand, or when the current provider fell through (no-show, cannot continue, suspended).

Where: **Dispatch Console** row action **Reassign**, or **Booking detail** (`/bookings/:id`) super_admin action panel "Reassign provider." Both use named eligible-provider choices rather than pasted UUIDs. Endpoint `POST /api/v1/admin/bookings/:id/reassign`. Super_admin only. Reason required (5+ chars on the console; Booking detail action minimums apply).

Steps:

1. [ ] Confirm the new provider is `approved` and online (`is_available = TRUE`). A suspended provider cannot be assigned.
2. [ ] Confirm they actually cover this service category and area.
3. [ ] Open the booking (Dispatch row or Booking detail).
4. [ ] Click **Reassign** and pick the named eligible provider.
5. [ ] Type a clear reason. It is audited in `admin_actions`. Example: "Original provider declined, reassigned to confirmed nearby pro per phone."
6. [ ] Confirm. Then message the customer so they know who is coming.

> IMPORTANT - suspension and escrow: if you suspend a provider while a job is in flight, the system flags that booking so escrow CANNOT release until an admin resolves it. So if you suspend a provider mid-job, you must either reassign the job or resolve it deliberately. Do not suspend and walk away. See `07-provider-support-sop.md` and `09-trust-safety-and-disputes.md`.

---

## 7. Peak-hours staffing

Home services in Metro Cebu cluster around mornings, weekends, paydays (15th and 30th), and the start of hot season for aircon work.

> **Set (editable):** treat the windows below as the starting peak guide. _Recommended default. Replace with real booking-curve data after the first month live._

Starting staffing guide (tune with data):

| Window | Coverage | Why |
|---|---|---|
| Weekday 8:00 AM to 12:00 PM | At least 1 dispatcher + 1 super_admin reachable | Morning booking surge |
| Weekday 12:00 PM to 6:00 PM | 1 dispatcher | Steady |
| Saturday 8:00 AM to 6:00 PM | 1 dispatcher + 1 super_admin | Weekend peak |
| Payday days (15th, 30th) | Add 1 dispatcher to the busiest window | Demand spike |
| Outside support hours | On-call only | Low volume; alerts route to on-call |

Hard rule: **every staffed window must have a super_admin who can actually push Reassign / Cancel / Message.** A plain admin alone cannot resolve a stuck paid job. If your only on-shift person is a plain admin, they escalate to the on-call super_admin.

Support hours stated to customers are Monday to Saturday, 8:00 AM to 6:00 PM PHT (`06-customer-support-sop.md`). Sunday is closed at launch; urgent safety issues still escalate via the on-call path. Dispatch coverage should at minimum match support hours, and auto-dispatch plus the cron sweeps keep running 24/7 on their own.

---

## 8. Shift-handover template

Copy this into your team channel at the end of every shift. Keep it short and honest.

```
=== DISPATCH SHIFT HANDOVER ===
Date / shift:           [e.g. 2026-06-19 AM]
Outgoing / incoming:    [name -> name]
Super_admin on next shift: [name]

LIVE NOW
- Active bookings:      [count]
- Providers online:     [count, by city if mixed]
- Socket status:        [connected / had drops]

OPEN ITEMS (must be handed over, not dropped)
- Unmatched paid jobs:  [booking IDs + city + how long waiting]
- No-provider cases:    [booking IDs + what was tried + next step]
- Manual reassigns in progress: [booking IDs]
- Suspended-mid-job (escrow frozen): [booking IDs + plan]
- Customers waiting on a callback/message: [booking IDs]

COVERAGE FLAGS
- Cities low on online providers: [city: count]
- Anything that needs recruiting/ops lead attention: [...]

INCIDENTS / NOTES
- [anything odd: socket outage, PayMongo webhook alert, dispatch frozen, etc.]

HANDED OVER BY: [name]  AT: [time PHT]
```

---

## 9. Copy-paste customer message templates

Use these from the Dispatch Console "Message customer" (lands as "Message from onService support"). Keep it plain. Use the customer's language where you know it (Bisaya / Tagalog / English).

**Still searching (early, reassuring):**
```
Hi! This is onService support. We are matching the best available pro for your
booking right now. Hang tight, we will confirm your provider shortly. Your
booking record currently shows [paid/held status]. We will verify it again before
any release or refund statement.
```

**Taking longer than usual:**
```
Hi, onService support here. Your provider is taking a little longer to match
because of demand in your area right now. We are working on it personally. We
will update you within the next few minutes. The booking payment status is
[verified status]; we will not infer payment from a browser redirect.
```

**No provider available, offering refund:**
```
Hi, this is onService support. We are sorry. We could not match an available pro
for your booking at this time. The approved outcome is a full refund plus a PHP
150 platform credit. Recorded refund destination/status/reference: [details].
Please do not retry any external payment link while we verify the recorded
result. Salamat for your patience.
```

**Reassigned to a new provider:**
```
Hi! Good news. We assigned a new pro to your booking and they are on the way.
You can chat with them in the app for a live ETA. Thanks for your patience.
```

SMS short version (if reaching out off-platform, under 160 chars):
```
onService: still matching a pro for your booking. We are verifying the recorded
payment/escrow status and will confirm shortly. Reply STOP to opt out.
```

---

## 10. Daily ops checklist

Run at shift start and shift end.

- [ ] Dispatch Console open, socket shows connected.
- [ ] Filter to each active city; eyeball providers-online count per city.
- [ ] No `requested` paid booking sitting unmatched beyond the SLA ceiling.
- [ ] Alert tail clear of unaddressed `no_provider_available`.
- [ ] Any `disputed` bookings handed to trust & safety, not parked on the dispatch board.
- [ ] Any suspended-mid-job bookings have a resolution plan (escrow is frozen on these).
- [ ] `auto_dispatch_enabled` is ON (System Settings, category Dispatch & Map). If it is OFF, every booking needs manual dispatch. Confirm that is intentional.
- [ ] Handover template posted (at shift end).

---

## 11. Weekly ops checklist

- [ ] Review the week's no-provider count by city. Rising count = a recruiting problem, route to `03-provider-recruiting-sop.md`.
- [ ] Check median time-to-match per city. Trending up = coverage thinning or providers ignoring offers.
- [ ] Check offer decline / timeout rate. High decline = price, distance, or provider-engagement problem; high timeout = providers not watching the app.
- [ ] Spot-check that the 5-second offer sweep is healthy: no large pile of stale `pending` offers with `expires_at` in the past. If offers are piling up unexpired, escalate to the API on-call (the cron may be down).
- [ ] Confirm cities near `min_providers_to_launch` are being fed by recruiting before we market harder there.
- [ ] Review any manual reassigns from the week. A spike in reassigns usually means one provider or one area is unreliable. Feed to `12-quality-standards-and-kpis.md` and provider support.
- [ ] Confirm no city is being actively marketed while its online-provider count is too low to serve demand. Flag to Ken / ops lead.

---

## 12. Quick escalation map

| Situation | Who | Where |
|---|---|---|
| Stuck paid job, need to push buttons | Super_admin on shift | Dispatch Console |
| Dispatch frozen / offers not cycling | API on-call | Infra channel; check the 5s sweep worker |
| Whole city has no online providers | Ops lead + recruiting | `03-provider-recruiting-sop.md` |
| Customer dispute filed | Trust & safety | `09-trust-safety-and-disputes.md` |
| Refund / escrow question | Money ops (super_admin) | `10-money-and-compliance-ops.md` |
| Provider suspended mid-job, escrow frozen | Super_admin | Booking detail + `07-provider-support-sop.md` |
| External checkout/top-up blocked | Ken + engineering | E14; do not retry, mark paid, or work around it |

---

## 13. One-page summary for a new dispatcher

- A real dispatch booking is server-verified paid with held escrow. Verify that state, then move quickly to a provider; never dispatch a merely pending payment attempt.
- Auto-dispatch offers ONE provider at a time, 45 seconds each, up to 10 tries, then it stops and tells the customer once.
- When it stops, YOU act: re-dispatch by hand, call providers, widen radius, or message + refund. Never go silent on the customer.
- Reassign and Cancel and Message customer are super_admin only. Every shift needs one reachable.
- A no-provider platform failure is a 100% refund plus a ₱150 goodwill credit. Do not apply the customer/provider cancellation brackets to it.
- Suspending a provider mid-job freezes that job's escrow. Reassign or resolve it; do not abandon it.
- Watch the board by status. `requested` with no provider is your fire. Disputes go to trust & safety.
- Hand over cleanly. Drop nothing.

---

## Open decisions set in this doc

- **No-provider refund + goodwill:** 100% full refund plus a ₱150 goodwill credit (editable). See section 5.
- **Peak-hours staffing windows:** the table in section 7 is the starting guide (editable); replace with real booking-curve data after the first month live.
- **Provider radius widening:** a per-booking judgment call, not a standing policy (editable). See step B1.
