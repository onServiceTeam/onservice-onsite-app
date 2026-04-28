# Phase 05 — Pre-Mortem

Five plausible incident scenarios for Provider 360 in production.

## 1. Super-admin manual wallet adjustment misused as covert credit drain

**Scenario:** A super-admin account is compromised. Attacker calls
`POST /api/v1/admin/providers/:id/wallet/adjust` with `amount: -10_000_000`
(₱100k debit) and `reason: "auto-correction"` against multiple providers.

**Detection:** Each call writes both a wallet_transactions ledger row of type
`adjustment` AND an audit_log entry. A daily anomaly alert on
`SELECT COUNT(*) FROM wallet_transactions WHERE type='adjustment' AND created_at >= NOW() - INTERVAL '1 day'`
exceeding a threshold (e.g., > 5) should fire.

**Mitigation:** The service refuses to make any wallet negative (boundary
test covers it), so total damage caps at the visible balance. SELECT … FOR
UPDATE prevents racing twin requests from double-debiting.

**Future hardening:** require dual-control (second super-admin ack) for
adjustments above a configurable centavo cap.

## 2. Note CRUD privilege creep

**Scenario:** Future refactor changes the auth check in `updateProviderNote`
to skip the `isSuperAdmin || authorId === actorId` gate — any admin can edit
or delete any note.

**Detection:** Boundary tests cover both the rejection path (403) and the
super-admin override path; they fail loudly if the guard is removed.

**Mitigation:** Tests are required to remain green per Phase 05 sub-directive
("A. Write the tests. No deferral.").

## 3. provider_admin_notes leaking to the provider via UI accident

**Scenario:** Someone wires the `/admin/providers/:id/notes` endpoint into
the provider mobile app or exposes it in a JSON payload to the provider's
profile page. Internal staff notes (potentially containing legal/financial
keywords) become visible to the provider.

**Detection:** The notes route is mounted only at `/api/v1/admin/...` and
gated by `requireAdmin`. Any caller without admin role gets 403. CORS is
bound to APP_URL (admin origin).

**Mitigation:** Notes table has no `is_visible_to_provider` column —
everything stored is by definition internal. The frontend NotesTab textarea
includes the disclaimer "Internal note (not visible to provider)".

## 4. Activity feed breaks because login_attempts schema relies on phone

**Scenario:** A migration changes `users.phone` (e.g., normalisation strips
the `+63` prefix). The existing `getProviderActivity` JOIN
`login_attempts.phone = users.phone` returns 0 login rows even though logins
happened. Admins lose visibility into the device/IP history.

**Detection:** Activity tab will silently show only audit events. Smoke test:
sign in as provider, then check Activity tab — must see at least 1 `login`
row.

**Mitigation:** Document the JOIN dependency in HONESTY-CHECK. Consider
adding `user_id` to login_attempts in a future phase to remove the phone-
keyed fragility.

## 5. wallet_transactions CHECK constraint regression breaks adjustments

**Scenario:** Migration 053 (this phase) adds 'adjustment' to the
wallet_transactions type CHECK. A future migration drops or rewrites that
constraint without including 'adjustment', causing every adjustment INSERT
to fail with a CHECK violation. Super-admin sees a 500 error; the wallet
row stays unchanged because the BEGIN…INSERT…COMMIT rolls back atomically.

**Detection:** The boundary test "credits wallet … conserves money" exercises
the INSERT path with type='adjustment'. If the constraint regresses, that
test fails immediately in CI when integration tests run against a real DB.

**Mitigation:** Migration 053 is additive (ADD CONSTRAINT after DROP IF
EXISTS) and will not silently lose other allowed types. Future migrations
that touch this constraint should reference this file.
