# Phase 30 — admin staff + PII reveal + push tokens + dispatch (2026-05-04)

Phase 29 closed suki + promo + waitlist + messaging. Phase 30 went after
the next four untouched flows from PHASE-29-FINAL's continuation list.
**Zero CRIT bugs found** in any of the 4 flows — the surfaces tested
were already correctly implemented. Phase 30b also wired one previously-
latent route (PII reveal) per the original Phase 14 D08 design intent.

## Coverage delta

| Track | Phase 29 | Phase 30 |
|---|---|---|
| Admin staff management (roles, members, DPO promote/demote) | not tested | **34/34 PASS** |
| PII reveal endpoint (latent verb + new route wired) | verb in CHECK only | **14/14 PASS, route wired** |
| Push token lifecycle + DeviceNotRegistered cleanup + retry queue | not tested | **11/11 PASS** |
| Dispatch /:id/match + self-assign + MED-N86 + MED-N90 | partial | **20/20 PASS** |
| Total real-runtime assertions | 1069+ | **1148+ (+79)** |

## Real bugs fixed in Phase 30

**Zero new CRIT bugs.** Every surface tested passed clean. Phase 30b's
PII reveal route was newly wired (real product work, not a fix —
analogous to Phase 28a's latent service wiring).

## Phase 30a — Admin staff management (34/34 PASS)

`test-phase30a-staff-management.mjs` covers:

**Roles:**
1. POST /staff/roles creates with valid permissions from ALL_PERMISSIONS list
2. GET /staff/roles lists
3. PUT /staff/roles/:id updates name/description/permissions
4. DELETE /staff/roles/:id soft-archives
5. Customer (non-super-admin) → 403 on every endpoint

**Staff members:**
6. POST /staff adds with role + writes `staff_added` admin_actions row
7. Duplicate userId → 409 (UNIQUE constraint)
8. Bogus role/user → 404
9. PUT /staff/:id updates is_active
10. DELETE /staff/:id soft-deletes (sets removed_at + removed_by) on freshly-active row
10b. Idempotent re-DELETE on already-inactive row → 200 no-op (does NOT update removed_at)
11. Cannot remove last active super_admin (architectural invariant — skipped if no admin_staff super_admin row exists in dev)

**Permissions:**
12. GET /staff/permissions returns 24-entry ALL_PERMISSIONS array

**DPO promote/demote (NPC RA 10173 §21):**
13. GET /staff/dpos lists
14. POST /staff/dpos/:userId/promote → user.role flips to 'dpo' + `staff_role_promoted_dpo` audit row
15. POST /staff/dpos/:userId/demote → role flips back + `staff_role_demoted_from_dpo` audit row
16. Bogus `demoteTo` value silently coerced to 'admin' (documented at staff.routes.ts:216-219 ternary)

## Phase 30b — PII reveal route wired (14/14 PASS)

The pii-mask.ts utility has comments referring to `POST /admin/audit-log/:id/reveal-pii` since Phase 14 D08, and the `pii_reveal` admin_actions verb was added to the CHECK constraint by migration 121 (Phase 25d) — but the route was never wired. Phase 30b finally adds it to `admin-latent.routes.ts` per the original design intent:

- Super-admin only (`requireSuperAdmin` guard)
- Reason ≥ 20 chars enforced (matches the design intent of "explain why you're peeking at raw PII")
- Returns the raw audit_log row (IP, user_agent, old_values, new_values unmasked)
- Writes a `pii_reveal` admin_actions row with reason + IP + user_agent of the revealing admin (NPC RA 10173 §22 trail)
- 404 on unknown audit_log id, 403 for non-super-admin, 401/403 for no auth

## Phase 30c — Push token lifecycle (11/11 PASS)

`test-phase30c-push-tokens.mjs` covers:
1. POST /notifications/push-token registers a token
2. UPSERT updates platform on duplicate (user_id, token) — UNIQUE constraint, no row count change
3. Multiple tokens per user supported (different tokens, same user)
4. Invalid platform → 400
5. No auth → 401
6. **DeviceNotRegistered cleanup verified** — overrode `globalThis.fetch` to return Expo error tickets; all 3 tokens removed from `push_tokens` after the delivery attempt
7. **Push retry queue enqueue verified** — overrode `fetch` to throw; row appears in `push_retry_queue` with status='pending' (MED-N57 flow proven)

## Phase 30d — Dispatch / customer self-assign (20/20 PASS)

`test-phase30d-dispatch.mjs` covers:
1. GET /:id/match returns ranked providers
2. /match on wrong-status booking → 409
3. /match without coords → 400
4. **MED-N90 verified**: response does NOT include `config`, `scoringWeights`, `maxAttempts`, or `offerTimeoutSeconds` (no reverse-engineering surface). Per-provider `score` IS exposed by design (UI shows ranking).
5. POST /:id/assign as customer → status=matched + provider_id set
6. POST /:id/assign as super-admin → 200
7. Conflicting booking (BUG-PHASE26-02 fix) → 409
8. Stranger /assign → 403
9. **MED-N86 verified**: customer self-assign emits `security_events` row with metadata.kind='customer_self_assigned_provider' (collusion-detection trail)
10. Bogus providerId → 404

**Note on the 45s offer chain:** `matching.service.getMatchConfig()` declares `offerTimeoutSeconds: 45` and `maxAttempts: 10` but no offer-cycle code exists. The flow today is one-shot: GET /:id/match returns ranked providers, customer or admin picks one via POST /:id/assign. Documented as Phase 31+ candidate if a real round-robin offer system is needed.

## Cumulative across Phase 17 → 30

- **53 real bugs** found + fixed (unchanged from Phase 29 — Phase 30 found none)
- **7 migrations** (117/118/119/120/121/122/123)
- **1148+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3848+ total assertions** verified
- **+1 latent route wired** (PII reveal)

## Test files committed in Phase 30

- `test-phase30a-staff-management.mjs` — 34 assertions
- `test-phase30b-pii-reveal.mjs` — 14 assertions
- `test-phase30c-push-tokens.mjs` — 11 assertions
- `test-phase30d-dispatch.mjs` — 20 assertions

## Files changed in Phase 30

- `packages/api/src/routes/admin-latent.routes.ts` — PII reveal route added (Phase 14 D08 design intent finally wired)

## Operational items surfaced for Ken/ops

- **PII reveal endpoint live**: super_admin can now request a one-row reveal of raw audit_log content via `POST /api/v1/admin/audit-log/:id/reveal-pii` with a ≥20-char reason. Every reveal writes a `pii_reveal` admin_actions row capturing the actor + reason + IP + user_agent. NPC RA 10173 §22 trail is in place.
- **Soft-validation on `demoteTo`**: bogus values silently coerce to 'admin'. Not a security issue but a UX nit — admin who passes `demoteTo='dispatcher'` won't see an error, the user just becomes admin. Could be tightened with explicit allowlist in Phase 31+.
- **DeviceNotRegistered cleanup proven correct**: stale Expo tokens are removed from push_tokens on first delivery failure, so old/uninstalled clients don't keep accumulating in the table.
- **Push retry queue enqueue proven correct on Expo outage**: when the Expo API is unreachable, the notification is enqueued with status='pending' for the gateway-retry cron to drain (MED-N57).
- **MED-N86 collusion detection wiring proven**: every customer self-assignment creates a `security_events` row with `metadata.kind='customer_self_assigned_provider'`. The bypass-detect cron (Phase 26b) and admin Compliance dashboard can now build patterns over time.
- **MED-N90 reverse-engineering surface closed**: the matching algorithm config (weights, max attempts, offer timeout) is NOT exposed via /:id/match. Customers see the ranked list + per-provider score (UI ranking) but cannot see which features the algorithm weights.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase30a-staff-management.mjs
- test-phase30b-pii-reveal.mjs
- test-phase30c-push-tokens.mjs
- test-phase30d-dispatch.mjs

Phase 31+ candidates (deferred):
- Implement actual 45s round-robin offer cycle (currently the config exists but no code wires it)
- Quiet hours support (notification_preferences extension + check in send/createNotification)
- BIR/VAT report PDF generation runtime (Phase 24c covered the route + status; PDF rendering not driven)
- Customer/provider mobile end-to-end via real Expo dev client (still outside autonomous scope per CLAUDE.md hard-stops)
- Per-socket rate-limit window-reset verification (long-running test)
- Tighten `demoteTo` validation to reject bogus values explicitly (cosmetic)
- Performance / load testing
